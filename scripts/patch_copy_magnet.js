const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'client', 'src', 'pages', 'Admin.tsx');
let code = fs.readFileSync(filePath, 'utf8');

const isCRLF = code.includes('\r\n');
code = code.replace(/\r\n/g, '\n');

// 1. Add Copy to lucide-react import
if (!code.includes('Copy,')) {
    code = code.replace('ExternalLink, Share2', 'ExternalLink, Share2, Copy');
    console.log('OK: Copy imported');
}

// 2. Add copy button to stream card
const oldBtn = `                                                        <button
                                                            type="button"
                                                            className="btn-start-ingest"
                                                            disabled={!st.magnet}
                                                            onClick={() => startIngest(r2MovieModal.movie, st.magnet, undefined, st.quality)}
                                                        >
                                                            <Download size={14} />
                                                            <span>گواستنەوە بۆ R2 ⚡</span>
                                                        </button>`;

const newBtn = `                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <button
                                                                type="button"
                                                                title="کۆپیکردنی لینکی تۆرێنت (ماگنت)"
                                                                onClick={() => {
                                                                    if (st.magnet) {
                                                                        navigator.clipboard.writeText(st.magnet);
                                                                        toast('لینکی ماگنت (تۆرێنت) کۆپی کرا بۆ کلیپبۆرد 📋');
                                                                    }
                                                                }}
                                                                style={{
                                                                    background: 'rgba(51, 65, 85, 0.75)',
                                                                    border: '1px solid rgba(148, 163, 184, 0.35)',
                                                                    color: '#38bdf8',
                                                                    borderRadius: '8px',
                                                                    padding: '7px 11px',
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px',
                                                                    fontSize: '12px',
                                                                    fontWeight: 600,
                                                                    transition: 'all 0.2s ease'
                                                                }}
                                                            >
                                                                <Copy size={13} />
                                                                <span>کۆپی</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-start-ingest"
                                                                disabled={!st.magnet}
                                                                onClick={() => startIngest(r2MovieModal.movie, st.magnet, undefined, st.quality)}
                                                            >
                                                                <Download size={14} />
                                                                <span>گواستنەوە بۆ R2 ⚡</span>
                                                            </button>
                                                        </div>`;

if (code.includes(oldBtn)) {
    code = code.replace(oldBtn, newBtn);
    console.log('OK: copy button added to stream card');
} else {
    console.error('FAIL: oldBtn not found');
}

if (isCRLF) {
    code = code.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Admin.tsx updated');
