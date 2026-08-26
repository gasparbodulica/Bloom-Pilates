const fs = require('fs');
const { translations } = require('./src/i18n.js');

let html = fs.readFileSync('index.html', 'utf8');
const hr = translations.hr;

// Regex to find data-i18n="key" and replace the inner content
html = html.replace(/<([^>]+data-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\w+>/g, (match, openingTag, key, innerContent) => {
    if (hr[key] !== undefined) {
        // Find the tag name
        const tagMatch = openingTag.match(/^([a-zA-Z0-9]+)/);
        const tagName = tagMatch ? tagMatch[1] : '';
        if (tagName) {
            return `<${openingTag}>${hr[key]}</${tagName}>`;
        }
    }
    return match;
});

// also for data-i18n-html
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
