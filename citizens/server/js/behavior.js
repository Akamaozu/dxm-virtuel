var socketio = require('socket.io-client'),
    create_task = require('cjs-task'),
    debounce = require('debounce'),
    app = create_task();

app.step( 'wait for document to load', function(){
  if( document.readyState == 'complete' ) return on_document_ready();
  else window.addEventListener( 'load', on_document_ready );

  function on_document_ready(){
    console.log( 'action=log-document-ready' );
    app.next();
  }
});

app.step( 'get / autoupdate window size', function(){
  window.addEventListener( 'resize', debounce( get_window_size, 99 , false ) );
  get_window_size();

  app.next();

  function get_window_size(){
    var window_dimensions = {};
        window_dimensions.width = window.innerWidth;
        window_dimensions.height = window.innerHeight;

    app.set( 'window-size', window_dimensions );
    console.log( 'action=get-window-size width='+ window_dimensions.width +'px height='+ window_dimensions.height +'px' );
  }
});

app.step( 'make video embed responsive', function(){
  var video_embed = document.querySelector( '#video-embed' ),
      window_size = app.get( 'window-size' ),
      video_parent = video_embed.parentNode,
      initial_dimensions = get_responsive_embed_stats(),
      video_embed_aspect_ratio = video_embed.offsetWidth / video_embed.offsetHeight;

  console.log( 'action=log-initial-embed-dimensions width='+ video_embed.offsetWidth +'px height='+ video_embed.offsetHeight +'px ratio='+ video_embed_aspect_ratio );

  update_responsive_embed({ w: initial_dimensions.video_parent.w, h: initial_dimensions.video_parent.w / video_embed_aspect_ratio });

  app.hook.add( 'value-updated', 'update-embed-dimensions', function( details ){
    if( details.key !== 'window-size' ) return;

    var stats = get_responsive_embed_stats();
    update_responsive_embed({ w: stats.video_parent.w, h: stats.video_parent.w / video_embed_aspect_ratio });
  });

  app.next();

  function update_responsive_embed( dimensions ){
    video_embed.style.width = dimensions.w +'px';
    video_embed.style.height = dimensions.h +'px';

    console.log( 'action=update-embed-dimensions width='+ dimensions.w +'px height='+ dimensions.h +'px' );
  }

  function get_responsive_embed_stats(){
    var stats = {};

    stats.window = { w: window_size.width, h: window_size.height };
    stats.video_parent = { w: video_parent.offsetWidth, h: video_parent.offsetHeight };

    return stats;
  }
});

app.step( 'setup socket.io', function(){
  var socketio_client = socketio();

  socketio_client.on( 'connect', function(){
    console.log( 'action=connect-socket-to-server success=true' );
  });

  socketio_client.on( 'connect', initiate_session );

  socketio_client.on( 'disconnect', function(){
    console.log( 'action=disconnect-socket-from-server success=true' );
  });

  app.set( 'socketio-client', socketio_client );

  app.next();

  function initiate_session(){
    var session_key;

    socketio_client.once( 'session-key', function( data ){
      session_key = data;
      console.log( 'action=get-session-key success=true key='+ session_key );

      app.hook.run( 'session-key-received' );
    });

    socketio_client.emit( 'initiate-session' );
  }
});

app.step( 'track clicks', function(){

  document.querySelectorAll( '.screen-action' ).forEach( function( trackable ){
    var screen = trackable.parentNode.parentNode.id;

    trackable.addEventListener( 'click', function(){
      var socketio_client = app.get( 'socketio-client' );
      if( ! socketio_client ) return;

      var tracked_element = trackable.id ? 'id='+ trackable.id : 'txt="'+ trackable.innerHTML +'"';
      if( screen ) tracked_element += ' screen='+ screen;

      socketio_client.emit( 'click-tracked', { element: tracked_element });
    });
  });

  app.next();
});

app.step( 'wait', function(){
  // no need to do anything
  // socket.io will handle the rest
});

app.start();