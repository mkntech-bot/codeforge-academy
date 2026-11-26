import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase";

function ProtectedRoute({ children }) {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;

    async function verifyAdmin() {
      const { data: { session }, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !session) {
        if (active) setStatus("unauthorized");
        return;
      }

      const { data: isAdmin, error } =
        await supabase.rpc("is_admin");

      if (error || !isAdmin) {
        await supabase.auth.signOut();

        if (active) setStatus("unauthorized");
        return;
      }

      if (active) setStatus("authorized");
    }

    verifyAdmin();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && active) {
        setStatus("unauthorized");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (status === "checking") {
    return <p>Verifying admin access...</p>;
  }

  if (status !== "authorized") {
    return <Navigate to="/admin-login" replace />;
  }

  return children;
}

export default ProtectedRoute;