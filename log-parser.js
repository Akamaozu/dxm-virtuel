var chunks_received = 0,
    lines_parsed = 0,
    server_logs = [],
    started = Date.now();

process.stdin.on( 'readable', function(){
  var received_buffer = process.stdin.read();
  if( ! received_buffer ) return;

  chunks_received += 1;

  var text_from_buffer = received_buffer.toString(),
      lines = text_from_buffer.split( '\n' );

  lines.forEach( function( line ){
    lines_parsed += 1;
    if( line.indexOf( '[server] ' ) != 0 ) return;

    line = line.replace( '[server] ', '' );

    var destructured_server_log_entry = line.split('='),
        next_key = destructured_server_log_entry.shift(),
        server_log_entry_json = {};

    destructured_server_log_entry.forEach( function( entry_chunk, chunk_index ){
      var destructured_entry_chunk,
          key = next_key,
          val;

      if( entry_chunk[0] !== '"' ){
        destructured_entry_chunk = entry_chunk.split(' ');
        val = destructured_entry_chunk[0];

        server_log_entry_json[ key ] = val;

        if( destructured_entry_chunk.length === 1 ) return;

        var destructured_entry_chunk = destructured_entry_chunk[1].split(' ');

        next_key = destructured_entry_chunk[ 0 ];
      }

      else {
        entry_chunk = entry_chunk.replace( '"', '' );
        destructured_entry_chunk = entry_chunk.split( '"' );

        server_log_entry_json[ key ] = destructured_entry_chunk[0];
        if( destructured_entry_chunk[1] !== '' ) next_key = destructured_entry_chunk[1].trim();
      }
    });

    console.log( 'action=log-server-entry-parsed entry='+ JSON.stringify( server_log_entry_json, null, 2 ) );
    server_logs.push( server_log_entry_json );
  });

  process.stdin.read();
});

process.stdin.on( 'end', function(){
  var end = Date.now();

  console.log( 'action=log-report duration='+( end - started )+'ms chunks='+ chunks_received +' lines-parsed='+ lines_parsed +' server-entries='+ server_logs.length );
});