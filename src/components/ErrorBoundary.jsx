import React from 'react'

/**
 * ErrorBoundary — a thrown render error unmounts the whole tree and leaves a white
 * page. That is why "it goes blank" has been unreportable: no message, no stack,
 * nothing to paste back. Catch it, show it, and let the user carry on.
 *
 * Nothing here touches the store: the store may be exactly what threw.
 */
export default class ErrorBoundary extends React.Component {
  state = { error: null, stack: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ stack: info?.componentStack || '' })
    console.error('Caught by ErrorBoundary:', error, info)
  }

  render() {
    const { error, stack } = this.state
    if (!error) return this.props.children

    const details = `${error.message}\n\n${error.stack || ''}\n\nComponent stack:${stack || ''}`

    return (
      <div className="p-4" style={{ maxWidth: 760, margin: '0 auto' }}>
        <h5 className="text-danger">Something broke on this screen.</h5>
        <p className="text-muted" style={{ fontSize: 13 }}>
          Your project is untouched — the workbooks are read-only and nothing was written.
          Copy the details below when reporting this.
        </p>

        <pre className="p-2 rounded" style={{
          background: '#f8f9fa', border: '1px solid #e9ecef',
          fontSize: 11, maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap',
        }}>{details}</pre>

        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-primary" onClick={() => this.setState({ error: null, stack: null })}>
            Try again
          </button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button className="btn btn-sm btn-outline-secondary"
            onClick={() => navigator.clipboard?.writeText(details)}>
            Copy details
          </button>
        </div>
      </div>
    )
  }
}
