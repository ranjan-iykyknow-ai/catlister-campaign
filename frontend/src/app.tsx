import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { CampaignWorkspace } from "@/pages/campaign-detail";

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <CampaignWorkspace />
    </QueryClientProvider>
  );
}
