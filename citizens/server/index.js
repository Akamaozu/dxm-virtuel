var create_task = require('cjs-task'),
      browserify = require('browserify'),
      js_base64 = require('js-base64'),
      socketio = require('socket.io'),
      debounce = require('debounce'),
      express = require('express'),
      mime = require('mime-types'),
      sha = require('sha.js'),
      path = require('path'),
      http = require('http'),
      fs = require('fs'),
      base64 = js_base64.Base64,
      app = create_task();

app.step( 'configure app variables', function(){

  app.set( 'express', express() );
  app.set( 'path-to-root', path.join( __dirname, '..', '..' ) );

  app.next();
});

app.step( 'catch all express routes, route through process-request hook', function(){
  var express = app.get( 'express' );

  express.use( function( req, res, express_next ){
    var req_handled = false;

    app.hook.run( 'incoming-request', req, handle_req );
    if( req_handled ) return;

    app.hook.run( 'unprocessed-request', req );
    return res.status( 500 ).send( 'something went wrong. please try again later.' );

    function handle_req(){
      app.hook.end();

      req_handled = true;
      return res;
    }
  });

  app.next();
});

app.step( 'handle unprocessed requests', function(){

  app.hook.add( 'unprocessed-request', 'log', function( unprocessed_req ){
    var ip = unprocessed_req.ip,
        url = unprocessed_req.url,
        protocol = unprocessed_req.protocol,
        method = unprocessed_req.method.toUpperCase();

    console.log( 'action=log-unprocessed-request protocol='+ protocol +' method='+ method +' url='+ url +' ip='+ ip );
  });

  app.next();
});

app.step( 'handle homepage requests', function(){
  var path_to_markup,
      home_markup;

  app.hook.add( 'incoming-request', 'serve-homepage', function( req, handle_req ){
    var dissected_url =  req.url.split( '/' );

    if( dissected_url.length != 2 ) return;
    else dissected_url.shift();

    var url_fragment_is_hash = dissected_url[0][0] === '#',
        url_fragment_is_querystring = dissected_url[0][0] === '?';

    if( ! url_fragment_is_hash && ! url_fragment_is_querystring && dissected_url[0].length > 0 ) return;

    var res = handle_req(),
        serve_homepage = create_task();

    serve_homepage.set( 'res', res );

    serve_homepage.callback( function( error ){
      if( error ) console.log( 'action=serve-homepage success=false reason="'+ error.message +'"', error );

      if( ! home_markup ) return serve_homepage.get( 'res' ).status( 400 ).send( 'file not found' );

      var res = serve_homepage.get( 'res' ),
          csp_script_src = serve_homepage.get( 'content-security-policy-script-src' );

      if( csp_script_src && csp_script_src.length > 0 ){
        var stringified_csp_script_src = csp_script_src.join( "' '" );
        res.set( 'Content-Security-Policy', 'script-src \''+ stringified_csp_script_src +'\'' );
      }

      res.send( home_markup );
    });

    if( ! home_markup ){

      serve_homepage.step( 'get homepage markup', function(){
        if( ! path_to_markup ) path_to_markup = path.join( app.get( 'path-to-root' ), 'citizens', 'server', 'home.html' );

        fs.readFile( path_to_markup, 'utf8', function( error, binary ){
          var log_entry = 'action=load-homepage-to-memory success=';

          if( error ) log_entry += 'false reason="'+ error.message +'"';
          else log_entry += 'true src="home.html"';

          console.log( log_entry );

          if( error ) return serve_homepage.end( new Error( 'unable to get homepage' ) );

          home_markup = binary.toString();
          serve_homepage.next();
        });
      });

      serve_homepage.step( 'update markup when source file updates', function(){

        fs.watch( path_to_markup, debounce(
          function( event, filename ){
            if( event !== 'change' ) return;

            fs.readFile( path_to_markup, 'utf8', function( error, binary ){
              var log_entry = 'action=update-homepage-in-memory success=';

              if( error ) log_entry += 'false reason="'+ error.message +'"';
              else log_entry += 'true reason="home.html updated"';

              if( binary ) home_markup = binary.toString();

              console.log( log_entry );
            });
          },
          100
        ));

        serve_homepage.next();
      });
    }

    serve_homepage.step( 'ensure homepage markup is loaded in memory', function(){
      if( ! home_markup ) throw new Error( 'homepage markup not found' );
      else serve_homepage.next();
    });

    serve_homepage.start();
  });

  app.next();
});

app.step( 'handle js requests', function(){
  app.set( 'scripts-cache', {});
  app.set( 'get-script', get_script );

  app.hook.add( 'incoming-request', 'serve-js', function( req, handle_req ){
    var is_js_request = req.url.indexOf( '/js/' ) == 0;
    if( ! is_js_request ) return;

    var dissected_url = req.url.split( '/js/' ),
        script_to_serve = dissected_url[1],
        serve_script = create_task(),
        res = handle_req();

    app.get( 'get-script' )( script_to_serve, function( error, data ){
      if( error ) res.status( 404 ).send( 'file not found' );
      else res.set( 'Etag', data.sha256 ).send( data.content );

      if( error ) console.log( error );
    });
  });

  app.next();

  function get_script( name, callback ){
    if( ! callback || typeof callback !== 'function' ) throw new Error( 'callback is required and must be a function' );
    if( ! name || typeof name !== 'string' ) return callback( new Error( 'script name is required and must be a string' ));

    var get_script = create_task();

    get_script.set( 'script-to-get', name );

    get_script.step( 'get script from cache and exit early', function(){
      var js_cache = app.get( 'scripts-cache' ),
          script_to_get = js_cache[ get_script.get( 'script-to-get' ) ];

      if( script_to_get ){
        get_script.set( 'script', script_to_get );
        return get_script.end();
      }

      else get_script.next();
    });

    cache_script_in_memory( get_script );

    get_script.step( 'update in-memory cache when file changes', function(){
      var script_to_get = get_script.get( 'script-to-get' ),
          path_to_script = path.join( __dirname, './js/', script_to_get );

      fs.watch( path_to_script, debounce( function( event, filename ){
        if( event !== 'change' ) return;

        var update_script_cache = create_task();

        update_script_cache.set( 'script-to-get', script_to_get );

        cache_script_in_memory( update_script_cache );

        update_script_cache.callback( function( error ){
          var log_entry = 'action=update-in-memory-script-cache script='+ script_to_get +' success=';

          if( error ) log_entry += 'false reason="'+ error.message +'"';
          else log_entry += 'true reason="source file updated"';

          console.log( log_entry );
        });

        update_script_cache.start();
      }, 100 ) );

      get_script.next();
    });

    get_script.callback( function( error ){
      if( error ) return callback( error );
      else callback( null, get_script.get( 'script' ) );
    });

    get_script.start();

    function cache_script_in_memory( task ){
      var path_to_script_dir = app.get( 'path-to-root' ) + '/citizens/server/js',
          script = task.get( 'script-to-get' ),
          path_to_script = path_to_script_dir +'/'+ script;

      task.step( 'browserify script', function(){
        var script_content = task.get( 'script' );

        browserify( path_to_script ).bundle( function( error, browserified_script ){
          if( error ) throw error;

          console.log( 'action=browserify-script success='+ ( error ? false : true ) +' src="js/'+ script +'"' );

          task.set( 'script', browserified_script );
          task.next();
        });
      });

      task.step( 'cache script and sha256 in-memory', function(){
        var js_cache = app.get( 'scripts-cache' ),
            script_struct = {};

            script_struct.script = script;
            script_struct.path = path_to_script;
            script_struct.content = task.get( 'script' );
            script_struct.sha256 = sha( 'sha256' ).update( script_struct.content ).digest( 'hex' );

        js_cache[ script ] = script_struct;
        task.set( 'script', script_struct );

        console.log( 'action=load-script-to-memory success=true src="js/'+ script +'"' );
        task.next();
      });
    }
  }
});

app.step( 'handle css requests', function(){
  var css_cache = {};

  app.hook.add( 'incoming-request', 'serve-css', function( req, handle_req ){
    var is_css_request = req.url.indexOf( '/css/' ) == 0;
    if( ! is_css_request ) return;

    var dissected_url = req.url.split( '/css/' ),
        stylesheet = dissected_url[1],
        serve_stylesheet = create_task(),
        res = handle_req();

    if( css_cache[ stylesheet ] ){
      var cached_data = css_cache[ stylesheet ];

      if( cached_data == '[ERROR]ENOENT' ) return res.status( 404 ).send( 'file not found' );
      else return res.set( 'Content-Type', 'text/css' ).send( cached_data );
    }

    var path_to_stylesheet_dir = app.get( 'path-to-root' ) + '/citizens/server/css';

    fs.readFile( path_to_stylesheet_dir +'/'+ stylesheet, 'utf8', function( error, binary ){
      if( error ) css_cache[ stylesheet ] = '[ERROR]ENOENT';
      else css_cache[ stylesheet ] = binary.toString();

      console.log( 'action=load-stylesheet-to-memory success='+ ( error ? false : true ) +' src="css/'+ stylesheet +'"' );

      if( error ) return res.status( 404 ).send( 'file not found' );

      res.set( 'Content-Type', 'text/css' ).send( css_cache[ stylesheet ] );

      fs.watch( path_to_stylesheet_dir +'/'+ stylesheet, debounce( function( event, filename ){
        if( event !== 'change' ) return;

        fs.readFile( path_to_stylesheet_dir +'/'+ stylesheet, 'utf8', function( error, binary ){
          var log_entry = 'action=update-stylesheet-in-memory success=';

              if( error ) log_entry += 'false reason="'+ error.message +'"';
              else log_entry += 'true reason="'+ stylesheet +' updated"';

              if( binary ) css_cache[ stylesheet ] = binary.toString();
              console.log( log_entry );
        });
      }, 100 ) );
    });
  });

  app.next();
});

app.step( 'handle image requests', function(){
  var img_cache = {};

  app.hook.add( 'incoming-request', 'serve-image', function( req, handle_req ){
    var is_image_request = req.url.indexOf( '/img/' ) == 0;
    if( ! is_image_request ) return;

    var dissected_url = req.url.split( '/img/' ),
        image = dissected_url[1],
        serve_image = create_task(),
        res = handle_req();

    if( img_cache[ image ] ){
      var cached_image = img_cache[ image ];
      if( cached_image == '[ERROR]ENOENT' ) return res.status( 404 ).send( 'file not found' );
      else return res.set( 'Content-Type', cached_image.mimetype ).send( cached_image.data );
    }

    var path_to_image_dir = app.get( 'path-to-root' ) + '/citizens/server/img';

    fs.readFile( path_to_image_dir +'/'+ image, function( error, binary ){
      if( error ) img_cache[ image ] = '[ERROR]ENOENT';
      else img_cache[ image ] = { data: binary };

      console.log( 'action=load-image-to-memory success='+ ( error ? false : true ) +' src="img/'+ image +'"' );

      if( error ) return res.status( 404 ).send( 'file not found' );

      var img_mimetype = mime.lookup( image );
      img_cache[ image ].mimetype = img_mimetype;

      res.set( 'Content-Type', img_cache[ image ].mimetype ).send( img_cache[ image ].data );

      fs.watch( path_to_image_dir +'/'+ image, debounce( function( event, filename ){
        if( event !== 'change' ) return;

        fs.readFile( path_to_image_dir +'/'+ image, function( error, binary ){
          var log_entry = 'action=update-image-in-memory success=';

              if( error ) log_entry += 'false reason="'+ error.message +'"';
              else log_entry += 'true reason="'+ image +' updated"';

              if( binary ) img_cache[ image ].data = binary;
              console.log( log_entry );
        });
      }, 100 ) );
    });
  });

  app.next();
});

app.step( 'create http server using express settings', function(){
  var express = app.get( 'express' ),
      server = http.createServer( express );

  app.set( 'server', server );
  app.next();
});

app.step( 'connect socket.io to server', function(){
  var server = app.get( 'server' ),
      socket_server = socketio( server ),
      connected = 0,
      sessions = {};

  socket_server.on( 'connection', function( socket ){

    socket.on( 'initiate-session', function(){
      var now = Date.now(),
          session_id_seed = socket.id + now,
          session_id = sha( 'sha256').update( session_id_seed ).digest( 'hex' );

      sessions[ session_id ] = { id: session_id, started: now, socket: socket };

      app.hook.run( 'session-started', session_id );

      console.log( 'action=session-started id='+ session_id );

      socket.emit( 'session-key', session_id );

      socket.on( 'click-tracked', function( screen ){
        console.log( 'action=log-tracked-click '+ screen.element +' session='+ session_id );
      });

      socket.on( 'disconnect', function( reason ){
        delete sessions[ session_id ];
        console.log( 'action=session-ended reason="'+ reason +'" session='+ session_id );
      });
    });
  });

  app.next();
});

app.step( 'start server', function(){
  var server = app.get( 'server' ),
      port = process.env.hasOwnProperty( 'PORT' ) ? process.env.PORT : 5555;

  server.listen( port, function( error ){
    if( error ) throw error;

    console.log( 'action=server-listen success=true port='+ port );
    app.next();
  });
});

app.step( 'wait', function(){
  // do nothing.
  // server code will handle the rest
});

app.start();