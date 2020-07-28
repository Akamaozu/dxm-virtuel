var supervisor = require('supe')(),
    path = require('path'),
    dotenv = require('dotenv'),
    path_to_root = path.join( __dirname );

dotenv.config();

supervisor.hook.add( 'server-excessive-crash', 'exit', function( details ){
  exit_app( new Error( 'server crashed excessively ('+ details.max_retries +' times in '+ details.duration +' mins)' ) );
});

supervisor.start( 'server', path_to_root + '/citizens/server/index' );

function exit_app( error ){
  if( error ) console.log( error );
  process.exit( error ? 1 : 0 );
}