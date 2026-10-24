const fs = require('fs');
const path = require('path');

const editorPath = path.join(__dirname, '..', 'client', 'src', 'components', 'DualSrtVideoEditor.tsx');
let editorCode = fs.readFileSync(editorPath, 'utf8');

editorCode = editorCode.replace(/window\.__waveformAudioCtx/g, '(window as any).__waveformAudioCtx');
fs.writeFileSync(editorPath, editorCode, 'utf8');
console.log('Fixed cast in DualSrtVideoEditor.tsx');
