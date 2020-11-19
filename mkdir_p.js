import fs from 'fs'
import path from 'path'
/**
 * Offers functionality similar to mkdir -p
 *
 * Asynchronous operation. No arguments other than a possible exception
 * are given to the completion callback.
 */
export default function mkdir_p(required_path, mode, position) {
    return new Promise(function(resolve, reject) {
        mode = mode || '0777';
        position = position || 0;
        var parts = path.normalize(String(required_path)).split('/');

        if (position >= parts.length) {
            resolve(true);
        }

        var directory = parts.slice(0, position + 1).join('/');
        fs.stat(directory, function(err) {
            if (err === null) {
                mkdir_p(required_path, mode, position + 1).catch((err) => { reject(err) }).finally(() => { resolve(true) });
            } else {
                fs.mkdir(directory, mode, function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        mkdir_p(required_path, mode, position + 1).catch((err) => { reject(err) }).finally(() => { resolve(true) });
                    }
                })
            }
        })
        resolve(true);

    })
}