var socketio = require('socket.io-client'),
    create_task = require('cjs-task'),
    app = create_task();

app.step( 'track clicks', function(){

  document.querySelectorAll( '.track-click' ).forEach( function( trackable ){
    trackable.addEventListener( 'click', function(){
      var socketio_client = app.get( 'socketio-client' );
      if( ! socketio_client ) return;

      socketio_client.emit( 'click-tracked', { element: trackable.innerHTML });
    });
  });

  app.next();
});

app.step( 'setup socket.io', function(){
  var socketio_client = socketio();

  socketio_client.on( 'connect', function(){
    console.log( 'action=connect-socket-to-server success=true' );
  });

  socketio_client.on( 'disconnect', function(){
    console.log( 'action=disconnect-socket-from-server success=true' );
  });

  app.set( 'socketio-client', socketio_client );
  app.next();
});

app.step( 'wait', function(){
  // no need to do anything
  // socket.io will handle the rest
});

app.start();