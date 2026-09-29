import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Si algo truena al pintar, se muestra un aviso con el error en lugar de una
// pantalla en blanco (así el usuario sabe que debe recargar y nos puede decir qué salió).
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("ErrorBoundary:", err, info?.componentStack); }
  render() {
    if (!this.state.err) return this.props.children;
    const e = this.state.err;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#0d1117", color: "#e6edf3", fontFamily: "sans-serif" }}>
        <div style={{ maxWidth: 480, width: "100%", border: "1px solid #ef444466", background: "#ef444411", borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>⚠️ Algo falló, recarga la página</div>
          <div style={{ fontSize: 14, color: "#8b949e", marginBottom: 12 }}>Si vuelve a pasar, mándale a Alan una captura de este mensaje.</div>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, background: "#161b22", padding: 10, borderRadius: 6, marginBottom: 12 }}>{String(e?.message || e)}</pre>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#f59e0b", color: "#0d1117", fontWeight: 700, cursor: "pointer" }}>Recargar</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
