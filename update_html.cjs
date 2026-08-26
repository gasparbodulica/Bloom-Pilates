const fs = require('fs');

global.localStorage = {
    getItem: () => null,
    setItem: () => null
};
global.document = {
    documentElement: {},
    querySelectorAll: () => []
};

async function run() {
    const { translations } = await import('./src/i18n.js');
    let html = fs.readFileSync('index.html', 'utf8');
    const hr = translations.hr;

    html = html.replace(/<([^>]+data-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\w+>/g, (match, openingTag, key, innerContent) => {
        if (hr[key] !== undefined) {
            const tagMatch = openingTag.match(/^([a-zA-Z0-9]+)/);
            const tagName = tagMatch ? tagMatch[1] : '';
            if (tagName) {
                return `<${openingTag}>${hr[key]}</${tagName}>`;
            }
        }
        return match;
    });

    html = html.replace(/<([^>]+data-i18n-html="([^"]+)"[^>]*)>([\s\S]*?)<\/\w+>/g, (match, openingTag, key, innerContent) => {
        if (hr[key] !== undefined) {
            const tagMatch = openingTag.match(/^([a-zA-Z0-9]+)/);
            const tagName = tagMatch ? tagMatch[1] : '';
            if (tagName) {
                return `<${openingTag}>${hr[key]}</${tagName}>`;
            }
        }
        return match;
    });

    fs.writeFileSync('index.html', html);
    console.log('HTML updated');
}

run();
