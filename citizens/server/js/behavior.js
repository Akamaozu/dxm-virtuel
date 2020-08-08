var socketio = require('socket.io-client'),
    create_task = require('cjs-task'),
    app = create_task();

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