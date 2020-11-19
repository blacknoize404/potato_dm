Currently under development, not suitable for production, and filled with bugs dinosaur-size

# potato_dm 

Basic download manager for node.js, with automatic pause/resume

## How to use
``` 
import { try_download } from 'potato_dm'

try_download('https://potatobite.github.com/assets/quotes.txt', "./downloads/text/")
    .then(() => { console.log("correct") })
    .catch(() => { console.log("error") });

```

## Future

In the future we are creating a deno module with no use of node modules, only "std" 