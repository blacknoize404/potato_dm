import http from 'http'
import fs from 'fs'
import path from 'path'
import url from 'url'
import mkdir_p from './mkdir_p.js'

/**
 * Tries to download the requested url to rquested path
 *
 * Fallback to current working directory
 */
export function try_download(url_path, to_path = '') {
    const options = {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/static/videos/1.mp4',
        method: 'GET'
    };

    return new Promise(function(resolve, reject) {
        const download = () => {
            const req = http.request(options, (res => {
                if (res.headers["accept-ranges"] === 'bytes') {
                    console.log("accept-ranges");
                }
                console.log(`content-disposition: ${res.headers["content-disposition"]}`)

                res.pipe(fs.createWriteStream(path.join(to_path, path.basename(url_path))));
                resolve(true); // successfully fill promise
            }));

            req.on('error', error => {
                //console.error(error)
                reject(error);
            });

            req.end();
        }

        if (!(to_path === '') && !fs.existsSync(to_path)) {
            try {
                mkdir_p(to_path).then(() => { console.log('asdad'); return download() }).catch((err) => { console.log(err) });
            } catch (err) {
                console.error(err)
                console.log("Cannot create output directory, setting to default: " + process.cwd())
                to_path = "";
                return download();
            }
        } else {
            return download();
        }

    });
}