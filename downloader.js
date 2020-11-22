import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import url from 'url'
import { EventEmitter } from 'events'



/**
 * Tries to download the requested url to requested path
 *
 * Fallback to current working directory
 */
async function try_download(url_path, to_path = '', event_emitter) {
    let url_parsed = url.parse(url_path, false);

    let protocol = http;

    const options = {
        hostname: url_parsed.hostname,
        port: url_parsed.port,
        path: url_parsed.pathname,
    };

    let headers = await get_headers(url_path, ["accept-ranges", "content-disposition", 'content-length']);
    let final_path = path.join(to_path, path.basename(url_path));
    let temp_ext = ""; //this is for download to a file with diferent ext for cache downloads, empty means no chache

    if (url_parsed.protocol == "https") { protocol = https };

    const download = ({ extra_headers = {}, write_mode = 'w', actual_size = 0 } = {}) => {

        const req = protocol.request({...options, ...extra_headers }, (res => {
            res.on('data', function(chunk) {
                actual_size = actual_size + chunk.length;
                let progress_percent = Math.round(actual_size * 100 / headers['content-length']);
                //process.stdout.write(`\rProgress: ${progress_percent}%`);
                event_emitter.emit('data_chunk', progress_percent);
            });
            res.on('end', () => {
                event_emitter.emit('end');
            });
            res.pipe(fs.createWriteStream(path.join(final_path + temp_ext), { flags: write_mode }));
        }));

        Object.keys(extra_headers).forEach((header) => {
            req.setHeader(header, extra_headers[header]);
        })
        req.on('error', error => {
            event_emitter.emit('error', error);
        });

        req.end();
    }

    try { //check if file is completly downloaded, if not tries to resume download
        let file_stats = fs.statSync(final_path);
        if (file_stats.size === parseInt(headers['content-length'])) {
            console.log("already exists");
            event_emitter.emit('end');
        } else if (headers['accept-ranges'] === 'bytes') {
            console.log("already exists, but incomplete, starting to resume donwload");
            download({ extra_headers: { 'Range': 'bytes=' + file_stats.size + '-' }, write_mode: 'a', actual_size: file_stats.size });
        } else { //download fresh file
            console.log("already exists, but incomplete, and can't resume");
            download();
        }
    } catch { //download fresh file
        fs.promises.mkdir(to_path, { recursive: true })
            .catch((err) => {
                console.error(err);
                console.log("Cannot create output directory, setting to default: " + process.cwd());
                to_path = "";
                download();
            })
            .then(() => {
                download();
            });
    };
}

/**
 * Extract the headers specified on req_data, from the url
 *
 * It uses a HEAD request by default
 */
export async function get_headers(url_path, req_data = ['']) {
    let url_parsed = url.parse(url_path, false);
    let protocol = http;
    let res_data = {};

    const options = {
        hostname: url_parsed.hostname,
        port: url_parsed.port,
        path: url_parsed.pathname,
        method: 'HEAD'
    };

    if (url_parsed.protocol == "https") { protocol = https }

    return new Promise(function(resolve, reject) {
        const req = protocol.request(options, (res => {
            req_data.forEach((element) => {
                res_data[element] = res.headers[element];
            })

            resolve(res_data); // successfully fill promise
        }));

        req.on('error', error => {
            reject(error);
        });

        req.end();
    });
}

export class PotatoDM extends EventEmitter {
    constructor(url_path, to_path = '') {
        super();
        this.url_path = url_path;
        this.to_path = to_path;
    }

    _try_download() {
        try_download(this.url_path, this.to_path, this);
    }

}