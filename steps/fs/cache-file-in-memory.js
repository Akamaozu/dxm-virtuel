var create_task = require('cjs-task'),
    debounce = require('debounce'),
    sha = require('sha.js'),
    fs = require('fs');

module.exports = function( task ){

  task.step( 'verify args', function(){
    var file_to_cache = task.get( 'file-to-cache' );
    if( ! file_to_cache ) throw new Error( 'file to cache not specified' );

    if( ! file_to_cache.hasOwnProperty( 'key' ) || typeof file_to_cache.key ) throw new Error( 'cache key is required and must be a string' );
    if( ! file_to_cache.hasOwnProperty( 'path' ) || typeof file_to_cache.path ) throw new Error( 'path to file is required and must be a string' );

    var cache = task.get( 'file-cache' );
    if( ! cache ) task.set( 'file-cache', {} );

    task.next();
  });


  task.step( 'get file from disc', function(){
    var path_to_file = task.get( 'file-to-cache' ).path;

    fs.readFile( path_to_file, 'utf8', function( error, content ){
      if( error ) throw error;

      task.set( 'file-content', content );
      task.next();
    });
  });

  task.step( 'cache file in memory', function(){
    var file_to_cache = task.get( 'file-to-cache' ),
        content = task.get( 'file-content' ),
        cache = task.get( 'file-cache' ),
        cache_key = file_to_cache.key,
        content_sha256 = sha( 'sha256' ).update( content ).digest( 'base64' );

    cache[ cache_key ] = { content: content, sha256: content_sha256 };

    task.next();
  });

  task.step( 'update cache when file changes', function(){
    var path_to_file = task.get( 'file-to-cache' ).path;

    fs.watch( path_to_file, debounce( function( event, filename ){
      if( event !== 'change' ) return;

      var update_cache = create_task();

      update_cache.set( 'script-to-get', script_to_get );
      update_cache.set( 'path-to-script-dir', path_to_script_dir );

      cache_script_in_memory( update_cache );

      update_cache.callback( function( error ){
        var log_entry = 'action=update-homepage-in-memory success=';

        if( error ) log_entry += 'false reason="'+ error.message +'"';
        else log_entry += 'true reason="'+ script_to_get +' updated"';

        console.log( log_entry );
      });

      update_cache.start();
    }, 100 ) );
  });
}