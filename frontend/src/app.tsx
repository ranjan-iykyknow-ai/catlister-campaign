import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/button";
import { getSession, login, logout } from "@/lib/api";
import { CampaignWorkspace } from "@/pages/campaign-detail";

function AuthenticatedApp() {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: getSession, staleTime: Number.POSITIVE_INFINITY });
  const loginMutation = useMutation({ mutationFn: login, onSuccess: (value) => client.setQueryData(["session"], value) });
  const logoutMutation = useMutation({ mutationFn: logout, onSuccess: (value) => client.setQueryData(["session"], value) });
  const [password, setPassword] = useState("");

  if (session.isLoading) return <main className="login-shell"><p>Loading campaign workspace…</p></main>;
  if (session.error) return <main className="login-shell"><p className="inline-error">{session.error.message}</p></main>;
  if (!session.data?.authenticated) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={(event: FormEvent) => { event.preventDefault(); loginMutation.mutate(password); }}>
          <p className="eyebrow">Private demo</p>
          <h1>Campaign Dispatcher</h1>
          <p className="page-subtitle">Enter the shared reviewer password to continue.</p>
          <label>Demo password<input autoFocus required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {loginMutation.error ? <p className="inline-error">{loginMutation.error.message}</p> : null}
          <Button loading={loginMutation.isPending} loadingLabel="Signing in…" type="submit">Open workspace</Button>
        </form>
      </main>
    );
  }

  return (
    <>
      {session.data.required ? <div className="session-strip"><button onClick={() => logoutMutation.mutate()} type="button">Sign out</button></div> : null}
      <CampaignWorkspace />
    </>
  );
}

export function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );
  return <QueryClientProvider client={queryClient}><AuthenticatedApp /></QueryClientProvider>;
}
