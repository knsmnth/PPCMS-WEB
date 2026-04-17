import React, { useState } from 'react';
import { Network, Copy, CheckCircle2, Server, Database, Activity } from 'lucide-react';
import styles from '../components/layout/layout.module.css';

const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ppoms-b384b';

const endpoints = [
  {
    name: 'Materials Description and Prices',
    description: 'Fetch the central repository of construction materials and their current pricing.',
    url: `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/materials`
  },

  {
    name: 'Labor Rates',
    description: 'Fetch standard labor classifications and their daily wages.',
    url: `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/laborTypes`
  }
];

export default function APIIntegrations() {
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleCopy = (url, index) => {
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className={styles.container} style={{ maxWidth: '1000px', margin: '0 auto', animation: 'fadeIn 0.4s ease-out' }}>
      <style>
        {`
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          .endpoint-card { transition: all 0.2s ease-in-out; border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; background: var(--card); overflow: hidden; position: relative; }
          .endpoint-card:hover { transform: translateY(-2px); box-shadow: 0 10px 30px -10px rgba(0,0,0,0.1); border-color: var(--primary); }
          .method-badge { background: rgba(74, 222, 128, 0.15); color: #166534; padding: 0.25rem 0.75rem; border-radius: 999px; font-weight: 700; font-size: 0.75rem; letter-spacing: 0.05em; margin-right: 1rem; }
          .dark .method-badge { color: #4ade80; }
          .url-box { background: rgba(0,0,0,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 0.75rem 1rem; font-family: monospace; font-size: 0.85rem; color: var(--foreground); display: flex; align-items: center; justify-content: space-between; overflow-x: auto; margin-top: 1rem; }
          .dark .url-box { background: rgba(255,255,255,0.03); }
          .copy-button { background: none; border: none; cursor: pointer; color: var(--muted-foreground); display: flex; align-items: center; justify-content: center; padding: 0.5rem; border-radius: 6px; transition: all 0.2s; }
          .copy-button:hover { background: var(--border); color: var(--foreground); }
        `}
      </style>

      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ padding: '0.75rem', background: 'var(--primary)', borderRadius: '12px', color: 'white', display: 'flex' }}>
            <Network size={28} />
          </div>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>API Integrations</h1>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.95rem', margin: '0.25rem 0 0 0' }}>Connect external systems to the PPCMS Master Data architecture.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
            <Server size={16} color="var(--primary)" />
            <span>Serverless Edge</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
            <Database size={16} color="var(--primary)" />
            <span>Direct Firestore Access</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
            <Activity size={16} color="var(--primary)" />
            <span>Real-time Sync</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {endpoints.map((ep, idx) => (
          <div key={idx} className="endpoint-card">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="method-badge">GET</span>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>{ep.name}</h2>
            </div>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem', marginBottom: '0' }}>{ep.description}</p>

            <div className="url-box">
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '1rem' }}>
                {ep.url}
              </span>
              <button
                className="copy-button"
                onClick={() => handleCopy(ep.url, idx)}
                title="Copy to clipboard"
              >
                {copiedIndex === idx ? <CheckCircle2 size={18} color="var(--primary)" /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        ))}

        <div style={{ marginTop: '2rem', padding: '1.5rem', borderRadius: '12px', background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.3)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', color: 'white' }}>
              <Network size={14} />
            </span>
            How to Integrate (Step-by-Step)
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 0.5rem 0' }}>Step 1: Choose Your Endpoint</h4>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted-foreground)', lineHeight: 1.5, margin: 0 }}>
                Copy the appropriate REST URL from the cards above. Because these master data collections are public for cross-system read access, you do not need authentication headers or API keys.
              </p>
            </div>

            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 0.5rem 0' }}>Step 2: Issue a HTTP GET Request</h4>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted-foreground)', lineHeight: 1.5, margin: '0 0 0.75rem 0' }}>
                Use any HTTP client or terminal application to ping the endpoint. Testing via terminal is extremely easy:
              </p>
              
              <h5 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Using cURL (Terminal)</h5>
              <pre style={{ background: 'rgba(0,0,0,0.04)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', margin: '0 0 1rem 0', fontSize: '0.85rem' }}>
<code className="language-bash">{`curl -X GET "YOUR_COPIED_URL"`}</code>
              </pre>

              <h5 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem' }}>Using JavaScript (Browser/Node.js)</h5>
              <pre style={{ background: 'rgba(0,0,0,0.04)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', margin: 0, fontSize: '0.85rem' }}>
<code className="language-javascript">{`fetch("YOUR_COPIED_URL")
  .then(response => response.json())
  .then(data => console.log(data.documents));`}</code>
              </pre>
            </div>

            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 0.5rem 0' }}>Step 3: Parsing the Firestore Native JSON</h4>
              <p style={{ fontSize: '0.9rem', color: 'var(--muted-foreground)', lineHeight: 1.5, margin: '0 0 0.75rem 0' }}>
                Google Cloud Firestore returns data using a type-safe structure. Every item is contained within the <code style={{ background: 'var(--accent)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>documents</code> array. You will need to drill into the <code style={{ background: 'var(--accent)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>fields</code> object to extract value properties (e.g., <code style={{ background: 'var(--accent)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>stringValue</code> or <code style={{ background: 'var(--accent)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>integerValue</code>).
              </p>
              
              <h5 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem', marginTop: '1rem' }}>Example A: Materials Structure</h5>
              <pre style={{ background: 'rgba(0,0,0,0.04)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', margin: 0, fontSize: '0.85rem' }}>
                <code className="language-json">{`{
  "documents": [
    {
      "name": "projects/\${FIREBASE_PROJECT_ID}/databases/(default)/documents/materials/34b56603-5fa7...",
      "fields": {
        "updatedAt": { "stringValue": "2026-03-23T01:46:13.127Z" },
        "createdAt": { "stringValue": "2026-03-22T03:25:55.491Z" },
        "unit": { "stringValue": "100" },
        "name": { "stringValue": "TV" },
        "currentPrice": { "integerValue": "15000" },
        "id": { "stringValue": "34b56603-5fa7-4d0c-bb52-e9bce41aa5f0" },
        "specs": { "stringValue": "Devant 32 inches" },
        "priceHistory": {
          "arrayValue": {
            "values": [
              {
                "mapValue": {
                  "fields": {
                    "date": { "stringValue": "2026-03-23T01:46:13.127Z" },
                    "price": { "integerValue": "10000" }
                  }
                }
              }
            ]
          }
        }
      }
    }
  ]
}`}</code>
              </pre>


              <h5 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.25rem', marginTop: '1.5rem' }}>Example B: Labor Structure</h5>
              <pre style={{ background: 'rgba(0,0,0,0.04)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', margin: 0, fontSize: '0.85rem' }}>
                <code className="language-json">{`{
  "documents": [
    {
      "name": "projects/\${FIREBASE_PROJECT_ID}/databases/(default)/documents/laborTypes/c7ace3d1-4e91...",
      "fields": {
        "createdAt": { "stringValue": "2026-03-22T14:27:25.458Z" },
        "name": { "stringValue": "labor" },
        "currentRate": { "integerValue": "500" },
        "id": { "stringValue": "c7ace3d1-4e91-4eaa-b439-29df8fc6fa0a" },
        "priceHistory": {
          "arrayValue": {
            "values": [
              {
                "mapValue": {
                  "fields": {
                    "date": { "stringValue": "2026-03-22T14:27:25.458Z" },
                    "price": { "integerValue": "500" }
                  }
                }
              }
            ]
          }
        }
      }
    }
  ]
}`}</code>
              </pre>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
