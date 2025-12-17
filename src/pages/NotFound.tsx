
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  // Determine if this might be a specific resource not found error
  const isCasePath = location.pathname.includes('/cases/');
  const isMemberPath = location.pathname.includes('/members/');
  const isSettingsPath = location.pathname.includes('/settings');

  // Get the ID from the URL if available
  const getResourceId = () => {
    const parts = location.pathname.split('/');
    return parts[parts.length - 1];
  };

  const getErrorMessage = () => {
    if (isCasePath) {
      return `The case you're looking for (ID: ${getResourceId()}) could not be found. It might not exist or might have been deleted.`;
    }
    if (isMemberPath) {
      return `The member you're looking for (ID: ${getResourceId()}) could not be found. It might not exist or might have been deleted.`;
    }
    if (isSettingsPath) {
      return "The settings page you're looking for could not be found.";
    }
    return "The page you're looking for doesn't exist or has been moved.";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-lg">
        <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-xl text-gray-600 mb-6">Page not found</p>
        
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
          <p>{getErrorMessage()}</p>
        </div>
        
        <div className="space-y-2">
          <Button asChild className="w-full">
            <Link to="/">Return to Dashboard</Link>
          </Button>
          
          {isCasePath && (
            <Button asChild variant="outline" className="w-full">
              <Link to="/cases">View All Cases</Link>
            </Button>
          )}
          
          {isMemberPath && (
            <Button asChild variant="outline" className="w-full">
              <Link to="/members">View All Members</Link>
            </Button>
          )}
          
          {isSettingsPath && (
            <Button asChild variant="outline" className="w-full">
              <Link to="/settings">Go to Settings</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotFound;
