import { useEffect, useState } from 'react'

// Preview HTML/CSS di iframe sandbox tanpa izin script (aman untuk kode apa pun), diperbarui setelah berhenti mengetik.
export function HtmlPreview({ code }: { code: string }) {
  const [doc, setDoc] = useState(code)
  useEffect(() => { const t = setTimeout(() => setDoc(code), 300); return () => clearTimeout(t) }, [code])
  return (
    <figure className="html-preview">
      <figcaption className="muted small">Preview langsung</figcaption>
      <iframe title="Preview HTML" sandbox="" srcDoc={doc} />
    </figure>
  )
}
