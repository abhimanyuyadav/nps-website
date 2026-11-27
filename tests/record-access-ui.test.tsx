import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { adminApi } from "@/components/admin/convex-api";
import { useRecordPages } from "@/components/admin/use-record-access";

const fixture = vi.hoisted(() => ({
  release: vi.fn(), version: "first", session: "first-admin",
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: fixture.session, sessionId: fixture.session }) }));
vi.mock("convex/react", () => ({
  useConvex: () => ({ url: "https://current.example.test" }),
  useMutation: () => fixture.release,
  usePaginatedQuery: () => ({
    results: [{ version: fixture.version, paginationOpts: { cursor: null, numItems: 20 } }],
    status: "Exhausted", loadMore: vi.fn(),
  }),
}));
afterEach(cleanup);
it("displays records only after audited release and drops cached records on account change", async () => {
  fixture.release.mockResolvedValueOnce({page:[{ _id:"synthetic-A" }]}).mockResolvedValueOnce({page:[]});
  const { result, rerender } = renderHook(() => useRecordPages(adminApi.listUsers, {}, {initialNumItems:20}));
  expect(result.current.results).toEqual([]);
  await waitFor(() => expect(result.current.results).toEqual([{_id:"synthetic-A"}]));
  rerender();
  expect(fixture.release).toHaveBeenCalledTimes(1);
  fixture.session="second-admin";
  rerender();
  expect(result.current.results).toEqual([]);
  await waitFor(() => expect(result.current.status).toBe("Exhausted"));
  expect(fixture.release).toHaveBeenCalledTimes(2);
});
