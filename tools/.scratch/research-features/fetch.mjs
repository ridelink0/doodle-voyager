// Render pages in headless Chrome and save their visible text, for pages that
// refuse plain HTTP clients. Usage: node fetch.mjs out-prefix url [url...]
import fs from 'node:fs';
import { launch } from 'file:///D:/doodle-voyager/tools/cdp.mjs';

const [prefix, ...urls] = process.argv.slice(2);
const b = await launch({ width: 1280, height: 900 });
await b.send('Network.enable');
await b.send('Network.setUserAgentOverride', {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});
let i = 0;
for (const url of urls) {
  i++;
  try {
    await b.goto(url, { waitMs: 6000 });
    const text = await b.eval(`document.title + "\\n" + location.href + "\\n\\n" + document.body.innerText + "\\n\\nLINKS\\n" +
      [...new Set([...document.querySelectorAll('a[href*="/comments/"]')].map((a) => a.href.split('?')[0]))].join("\\n")`);
    fs.writeFileSync(`${prefix}-${i}.txt`, text);
    console.log(i, url, text.length);
  } catch (e) {
    console.log(i, url, 'ERR', e.message);
  }
}
await b.close();
