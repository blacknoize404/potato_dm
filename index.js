//var http = require('http');
//var https = require('https');
var fs = require('fs');
var path = require('path');
var url = require('url');
var { EventEmitter } = require('events');
var crypto = require('crypto');
var http = require('follow-redirects').http;
var https = require('follow-redirects').https;

/**
 * Tries to download the requested url to requested path
 *
 * Fallback to current working directory, and need one event emitter 
 */
async function try_download({ url_path, download_folder_path = '', event_emitter, fresh = false, extra_headers = {}, file_name = '', allowed_redirect_hosts = null, timeout = 10000 } = {}, ) {
    //let url_parsed = url.parse(url_path, false);
    let url_parsed = new URL(url_path);

    let protocol = http;

    const options = {
        hostname: url_parsed.hostname,
        port: url_parsed.port,
        path: url_parsed.pathname,
        timeout: timeout,
    };

    let headers = await get_headers(url_path, ["accept-ranges", "content-disposition", 'content-length'], timeout).catch(err => {
        //console.log(err);//this empty catch propagates the catch to the instance of dm
    });

    let temp_ext = ""; //this is for download to a file with diferent ext for cache downloads, empty means no chache
    let extra_headers_to_pass = extra_headers;
    if (url_parsed.protocol == "https" || url_parsed.protocol == "https:") { protocol = https };

    const download = ({ extra_headers = {...extra_headers_to_pass }, write_mode = 'w', actual_size = 0 } = {}) => {
        let download_file_path = calc_file_path(url_path, file_name, download_folder_path);

        return new Promise(function(resolve, reject) {
            if (headers === 'timeout') {
                event_emitter.emit('timeout', (options.timeout / 1000) + " seconds expired");
                reject('timeout');
            }
            if (headers === 'error') {
                let error = { error: "error getting headers from server" };
                event_emitter.emit('error', error);
                reject(error);
            }
            if (allowed_redirect_hosts != null) {
                options.beforeRedirect = (options, { headers }) => {
                    // Use this to adjust the request options upon redirecting,
                    // to inspect the latest response headers,
                    // or to cancel the request by throwing an error
                    //console.log(options.hostname);
                    allowed_redirect_hosts.forEach((host, index) => {
                        if (options.hostname != host) {
                            let warning = { warning: "warning, redirecting to non allowed host: " + options.hostname };
                            event_emitter.emit('warning', warning);
                            reject(warning);
                        }
                    });
                };
            }

            const req = protocol.request({...options, headers: {...extra_headers, ...options.headers } }, (res => {
                if (res.statusCode >= 200 && res.statusCode < 300) { //dont know much of status codes, fix later on
                    res.on('data', function(chunk) {
                        actual_size = actual_size + chunk.length;
                        let progress_percent = "---";
                        try {
                            progress_percent = (actual_size * 100 / headers['content-length']).toFixed(2);
                        } catch {
                            console.log("Can't show download progress, there is no content-length in headers");
                        }
                        event_emitter.emit('data_chunk', progress_percent);
                    });
                    res.on('end', () => {
                        event_emitter.emit('end', url_path, download_file_path);
                        resolve(true); // successfully fill promise
                    });
                    res.pipe(fs.createWriteStream(path.join(download_file_path + temp_ext), { flags: write_mode }));
                } else {
                    let error = { error: "error retrieving from server", statusCode: res.statusCode };
                    event_emitter.emit('error', error);
                    reject(error);
                }
            }));

            Object.keys(extra_headers).forEach((header) => {
                //not sure why added this here, maybe can delete it if all headers are already passed to request in his call
                req.setHeader(header, extra_headers[header]);
            })

            req.on('timeout', function() {
                event_emitter.emit('timeout', (options.timeout / 1000) + " seconds expired");
                //req.destroy();
                reject('timeout');
                req.abort();
            });

            req.on('error', error => {
                event_emitter.emit('error', error);
                reject(error);
            });
            req.end();
        });
    }


    const fresh_download = () => {
        return fs.promises.mkdir(download_folder_path, { recursive: true })
            .catch((err) => {
                event_emitter.emit('error', err, "Cannot create output directory, setting to default: " + process.cwd());
                download_folder_path = "";
                return download();
            })
            .then(() => {
                return download();
            });
    };

    if (!fresh) {
        try { //check if file is completly downloaded, if not tries to resume download
            let download_file_path = calc_file_path(url_path, file_name, download_folder_path);
            let file_stats = fs.statSync(download_file_path);
            if (file_stats.size === parseInt(headers['content-length'])) {
                event_emitter.emit('already exists');
                event_emitter.emit('end', url_path, download_file_path);
            } else if (headers['accept-ranges'] === 'bytes') {
                event_emitter.emit('already_exists_resuming', "already exists, but incomplete, starting to resume download");
                return download({ extra_headers: { 'Range': 'bytes=' + file_stats.size + '-', ...extra_headers }, write_mode: 'a', actual_size: file_stats.size });
            } else { //download fresh file
                event_emitter.emit('already_exists_restanting', "already exists, but incomplete, and can't resume, restarting fresh download");
                return fresh_download();
            }
        } catch { //download fresh file
            return fresh_download();
        };
    } else {
        return fresh_download();
    }
}

/**
 * Extract the headers specified on req_data, from the url
 *
 * It uses a HEAD request by default
 */
async function get_headers(url_path, req_data = [''], timeout = 10000) {
    let url_parsed = url.parse(url_path, false);
    let protocol = http;
    let res_data = {};

    const options = {
        hostname: url_parsed.hostname,
        port: url_parsed.port,
        path: url_parsed.pathname,
        method: 'HEAD',
        timeout: timeout,
    };

    if (url_parsed.protocol == "https") { protocol = https }

    return new Promise(function(resolve, reject) {
        const req = protocol.request(options, (res => {
            req_data.forEach((element) => {
                res_data[element] = res.headers[element];
            })

            resolve(res_data); // successfully fill promise
        }));

        req.on('timeout', function() {
            reject('timeout');
            req.destroy();
        });

        req.on('error', error => {
            reject(error);
        });

        req.end();
    });
}

/**
 * Utility for getting the resulting path to file
 *
 * If no `file_name` present, gets it from url.
 * 
 * If `extra_extension`, is appended at the end, besides the `file_name` extension
 */
const calc_file_path = (url_path, file_name = '', download_folder_path = '', extra_extension = '') => {
    let file_path = '';
    if (typeof file_name === 'string' && file_name !== '') {
        file_path = path.join(download_folder_path, file_name);
    } else {
        file_path = path.join(download_folder_path, path.basename(url_path));
    }
    return append_file_extension(file_path, extra_extension);
}

/**
 * Utility for adding an extra extension to de route
 * 
 * If `extension`, is appended at the end, besides the `file_name` extension.
 */
const append_file_extension = (path, extension = '') => {
    let extension_to_append = '';
    if (typeof extension === 'string' && extension !== '') {
        extension_to_append = '.' + extension;
    }
    return (path + extension_to_append);
}

class PotatoDM extends EventEmitter {
    /**
     * Main download manager, 
     *
     * Instanced for one url to download and one destination path
     * 
     * 
     * @param extra_params: object with extra params like:
     * @param extra_params-extra_headers: if present, injects headers to the request
     * @param extra_params-check_integrity: tells if validate file integrity by checksum, default to `sha1`
     * @param extra_params-allowed_redirect_hosts: list to check if redirects are in. The event emitter trows warning if not
     * @param extra_params-timeout: time in miliseconds to wait for the conection
     * 
     * @todo implement `extra_params-check_integrity` this taking into account supported hashes.
     * 
     * 
     */
    constructor(url_path, download_folder_path = '', { extra_headers = {}, check_integrity = 'sha1', file_name = '', allowed_redirect_hosts = null, timeout = 10000 } = {}) {
        super();
        this.url_path = url_path;
        this.download_folder_path = download_folder_path;
        this.extra_headers = extra_headers;
        this.check_integrity = check_integrity;
        this.file_name = file_name;
        this.default_ceck_integrity = 'sha1';
        this.allowed_redirect_hosts = allowed_redirect_hosts;
        this.timeout = timeout;
    };
    /**
     * Tries to download the requested url to requested path, all parameters retrieved from class instance
     *
     * Fallback to current working directory
     * 
     * Need one event emitter(provided by class)
     * 
     * @param fresh: If `true`, it will download a fresh version even if is already downloaded and correct.
     * 
     */
    _try_download(fresh = false) {
        return try_download({ url_path: this.url_path, download_folder_path: this.download_folder_path, event_emitter: this, fresh: fresh, extra_headers: this.extra_headers, file_name: this.file_name, allowed_redirect_hosts: this.allowed_redirect_hosts, timeout: this.timeout })
            .then(() => {
                //console.log(append_file_extension(this.url_path, this.check_integrity || this.default_ceck_integrity));
                if (this.check_integrity) this._check_integrity();
            })
            .catch(error => {

            });
    };
    /**
     * Check the integrity of downloaded file
     *
     * The download of checksum file fallbacks to current working directory, and extension `.sha1`.
     * 
     * Need one event emitter(provided by class)
     * 
     * @param fresh: if true, it will download a fresh version even if is already downloaded and correct. Default to `true`
     * 
     */
    _check_integrity(checksum_url = append_file_extension(this.url_path, this.check_integrity || this.default_ceck_integrity), fresh = true) {
        let event_emitter = this;
        let check_integrity = this.check_integrity;
        let file_path = calc_file_path(this.url_path, this.file_name, this.download_folder_path);

        event_emitter.emit('check_integrity_start', { file_path: file_path, hash_type: check_integrity });

        return try_download({ url_path: checksum_url, download_folder_path: this.download_folder_path, event_emitter: this, fresh: fresh, file_name: (this.file_name ? append_file_extension(this.file_name, check_integrity || this.default_ceck_integrity) : ''), extra_headers: this.extra_headers, timeout: this.timeout })
            .then(() => {
                let file_hash_path = calc_file_path(checksum_url, this.file_name, this.download_folder_path, this.check_integrity);
                let hash = crypto.createHash(this.check_integrity);
                let stream = fs.createReadStream(file_path);
                let expected_hash = '';

                /** 
                 * @todo use other encodings, or guess encoding
                 * @todo check a best the method of reading checksum, is actually spliting file content, etc
                 */
                fs.readFile(file_hash_path, 'utf8', (err, data) => {
                    if (err) throw err;
                    expected_hash = data.split(' ')[0];
                });

                stream.on('data', function(data) {
                    hash.update(data, 'utf8') //why utf8?
                });

                stream.on('end', function() {
                    let hash_value = hash.digest('hex');
                    event_emitter.emit('check_integrity_end', { file_path: file_path, hash_type: check_integrity, hash: hash_value, pass: (hash_value === expected_hash) });
                })
            })
            .catch(error => { //this is here solely for unhandled rejection warning
                event_emitter.emit('error_downloading_checksum', { file_path: file_path, hash_type: check_integrity });
            });
    };
};

exports.PotatoDM = PotatoDM;
exports.get_headers = get_headers;