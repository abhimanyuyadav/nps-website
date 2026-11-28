import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { DepartmentsBanner } from "@/components/admin/departments-banner";
import SchoolLifePage from "@/app/(site)/campus-life/page";
import DepartmentsPage from "@/app/(site)/departments/page";

const m = vi.hoisted(() => ({ save: vi.fn(), upload: vi.fn(), pages: vi.fn(), getCmsPage: vi.fn() }));
vi.mock("convex/server", () => ({ makeFunctionReference: (name: string) => name }));
vi.mock("@/components/admin/use-record-access", () => ({
  useRecordPages: () => ({ results: m.pages(), status: "Exhausted" }),
}));
vi.mock("convex/react", () => ({
  useMutation: () => m.save,
  useQuery: () => undefined,
  usePaginatedQuery: (ref: string) => ({
    results: ref === "admin:listContent" ? m.pages() : [],
    status: "Exhausted",
  }),
}));
vi.mock("@/components/admin/admin-gate", () => ({
  AdminFeatureGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/admin/use-media-upload", () => ({ useMediaUpload: () => m.upload }));
vi.mock("@/lib/data/public", () => ({ getDepartments: async () => [], getCmsPage: m.getCmsPage }));

beforeEach(() => {
  vi.resetAllMocks();
  m.pages.mockReturnValue([]);
});
afterEach(cleanup);

it("uploads a verified photo and publishes it only after explicit selection", async () => {
  m.upload.mockResolvedValue("uploaded-photo");
  render(<DepartmentsBanner />);
  const file = new File(["photo"], "school.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Upload a photo"), { target: { files: [file] } });
  expect(await screen.findByText(/Photo uploaded/)).toBeVisible();
  expect(m.upload).toHaveBeenCalledWith(file, "", "departments");
  expect(m.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Publish photo" }));
  await waitFor(() =>
    expect(m.save).toHaveBeenCalledWith({
      payload: {
        type: "pages",
        data: expect.objectContaining({
          slug: "departments",
          heroImageId: "uploaded-photo",
          status: "published",
        }),
      },
    }),
  );
});

it("restores the default on the same page without discarding its text or SEO", async () => {
  const page = {
    _id: "page-1",
    slug: "departments",
    title: "Our departments",
    body: "Original copy",
    seo: { title: "Original title" },
    status: "published",
    heroImageId: "old",
    heroImageUrl: "/old.jpg",
  };
  m.pages.mockReturnValue([page]);
  render(<DepartmentsBanner />);
  fireEvent.click(screen.getByRole("button", { name: "Use the default photo" }));
  fireEvent.click(screen.getByRole("button", { name: "Publish photo" }));
  await waitFor(() =>
    expect(m.save).toHaveBeenCalledWith({
      payload: {
        id: page._id,
        type: "pages",
        data: { slug: page.slug, title: page.title, body: page.body, seo: page.seo, status: "published" },
      },
    }),
  );
});

it.each([
  [null, "/media/science-lab.png"],
  [{ heroImageUrl: "/approved.jpg" }, "/approved.jpg"],
])("renders the directory with its published banner or default", async (page, expected) => {
  m.getCmsPage.mockResolvedValue(page);
  const { container } = render(await DepartmentsPage());
  expect(m.getCmsPage).toHaveBeenCalledWith("departments");
  expect(decodeURIComponent(container.querySelector("img")!.getAttribute("src")!)).toContain(expected);
});

it("shows only the school-selected photo in both School life locations", async () => {
  m.getCmsPage.mockResolvedValue(null);
  const view = render(await SchoolLifePage());
  expect(m.getCmsPage).toHaveBeenCalledWith("campus-life");
  expect(view.container.querySelectorAll("img")).toHaveLength(0);
  m.getCmsPage.mockResolvedValue({ heroImageUrl: "/approved.jpg" });
  view.rerender(await SchoolLifePage());
  const photos = Array.from(view.container.querySelectorAll("img"));
  expect(photos).toHaveLength(2);
  for (const photo of photos) expect(decodeURIComponent(photo.src)).toContain("/approved.jpg");
});

it("publishes an uploaded photo to the School life page", async () => {
  m.upload.mockResolvedValue("verified-photo");
  render(<DepartmentsBanner section="campus-life" />);
  const file = new File(["photo"], "school.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Upload a photo"), { target: { files: [file] } });
  await screen.findByText(/Photo uploaded/);
  expect(m.upload).toHaveBeenCalledWith(file, "", "campus-life");
  fireEvent.click(screen.getByRole("button", { name: "Publish photo" }));
  await waitFor(() =>
    expect(m.save).toHaveBeenCalledWith({
      payload: {
        type: "pages",
        data: expect.objectContaining({ slug: "campus-life", heroImageId: "verified-photo" }),
      },
    }),
  );
});
