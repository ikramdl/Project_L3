import Dashboard from './Dashboard';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-100">
        <Dashboard />
      </div>
    </ErrorBoundary>
  );
}

export default App;