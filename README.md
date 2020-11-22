Currently under development, not suitable for production, and filled with bugs dinosaur-size

# potato_dm 

Basic download manager for node.js, with automatic pause/resume

## Install

yarn:	`yarn add https://github.com/daroxs95/potato_dm`

npm:	`npm install https://github.com/daroxs95/potato_dm`

## How to use
I strongly encourage using one downloader manager(`PotatoDM` instance) for every file to download:
``` 
import { PotatoDM } from 'potato_dm'

const my_dm = new PotatoDM('https://potatobite.github.com/assets/quotes.txt', "./downloads/text/");

my_dm.on('end', () => {
    console.log("finished");
});

my_dm.on('data_chunk', (progress) => {
    process.stdout.write(`\rProgress: ${progress}%`);
})

my_dm._try_download();

```

## Future

In the future we are creating a deno module with no use of node modules, only "std" , and making the downloader manager(`PotatoDM` instance) handle multiple downloads.