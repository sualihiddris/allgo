import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store';

export function ProtectedRoute() {
  const {
    isAuthenticated,
    isLoading,
    isInitialized,
    initializationError,
    initialize,
  } = useAuthStore();

  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (initializationError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">
            Admin session unavailable
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            {initializationError}
          </p>

          <button
            type="button"
            className="btn-primary mt-6"
            onClick={() => void initialize()}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
