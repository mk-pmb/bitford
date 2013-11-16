var httpStreamPort;

createHTTPServer(function(req, res) {
    var path = req.path.split("/").map(function(s) {
	return decodeURIComponent(s);
    });
    while(path[0] === "")
	path.shift();
    var torrentName;
    if (path.length > 1)
	torrentName = path.shift();
    else
	torrentName = path[0];
    console.log("torrentName", torrentName, "path", path);

    var size, offset;
    for(var i = 0; i < torrents.length; i++) {
	var torrent = torrents[i];
	if (torrent.name !== torrentName)
	    continue;
	offset = 0;
	for(var j = 0; j < torrent.files.length; j++) {
	    var file = torrent.files[j];
	    if (arrayEq(file.path, path)) {
		size = file.size;
		break;
	    }
	    offset += file.size;
	    file = undefined;
	}
	if (file)
	    break;
	torrent = undefined;
    }
    if (torrent && file) {
	var contentType = getMimeType(path);
    	handleStreamRequest(req, res, contentType, offset, size, torrent);
    } else {
    	res.writeHead(404, "Not found", {});
    	res.end();
    }
}, function(err, port) {
    if (port)
	httpStreamPort = port;
});

function handleStreamRequest(req, res, contentType, torrentOffset, size, torrent) {
    var m, start, end;
    if ((m = (req.headers["Range"] + "").match(/^bytes=(\d*)-(\d*)/))) {
        start = parseInt(m[1], 10);
        end = parseInt(m[2], 10);
        if (end)
            end++;
        else
            end = size;
    }
    console.log("start", start, "end", end);
    if (typeof start !== 'number')
        res.writeHead(200, "OK", {
            "Content-Type": contentType,
            "Content-Length": size + ""
        });
    else
        res.writeHead(206, "Partial content", {
            "Content-Type": contentType,
            "Content-Range": "bytes " + (typeof start == 'number' ? start : "") + "-" + (end ? (end - 1) : "") + "/" + size,
            "Content-Length": (end - start) + ""
        });

    var bytes = start || 0;
    var looping = false;
    function loop() {
        if (looping)
            return;
        looping = true;
        console.log("loop", bytes, "/", end, size);
        if (bytes >= size || bytes >= end) {
            res.end();
            return;
        }

        torrent.store.consume(torrentOffset + bytes, function(data) {
            if (data.byteLength > 0) {
		console.log("consume", data.byteLength);
                if (bytes + data.byteLength > end)
                    data = data.slice(0, end - bytes);
		try {
                    res.write(data);
		} catch(e) {
		    console.error(e.stack || e.message || e);
		}
                bytes += data.byteLength;
                looping = false;
            } else {
		console.log("consume end");
                res.end();
	    }
        });
    }
    res.onDrain = loop;
    loop();
}
