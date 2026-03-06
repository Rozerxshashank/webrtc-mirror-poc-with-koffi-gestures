const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './sender.html';
    if (filePath === './receiver') filePath = './receiver.html';
    if (!path.extname(filePath)) filePath += '.html';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404);
            res.end("File not found");
        } else {
            const ext = path.extname(filePath);
            const contentType = ext === '.css' ? 'text/css' : (ext === '.js' ? 'application/javascript' : 'text/html');
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}).listen(PORT, () => {
    console.log(`Prototype server running at http://10.110.153.74:${PORT}`);
    console.log(`- Sender: http://10.110.153.74:${PORT}/sender.html`);
    console.log(`- Receiver: http://10.110.153.74:${PORT}/receiver.html`);
});
