"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  File,
  ImageIcon,
  LockKeyhole,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  editorDateValue,
  editorRecordValue,
  isSeoEditorField,
  seoInputFromEditor,
} from "@/lib/content/admin-editor";
import { ADMIN_ACCESS_ROLES } from "@/lib/admin/authorization";
import { AdminFeatureGate } from "./admin-gate";
import { MediaThumbnail } from "./media-thumbnail";
import {
  adminApi,
  mediaApi,
  usersApi,
  type AdminRecord,
  type ContentType,
  type PublicationStatus,
} from "./convex-api";
import { PageHeading } from "./page-heading";
import {
  EmptyState,
  Feedback,
  LoadingPanel,
  PaginationControls,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "./ui";
import { useModalAccessibility } from "./use-modal-accessibility";

export type EditorField = {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "url"
    | "number"
    | "datetime"
    | "boolean"
    | "list"
    | "select"
    | "media"
    | "reference";
  mediaKind?: "image" | "document";
  referenceType?: ContentType;
  referenceStatus?: PublicationStatus;
  referenceMatchCurrentIdBy?: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: readonly { label: string; value: string }[];
  defaultValue?: string | boolean;
};

const mediaUrlFields: Record<string, string> = {
  heroImageId: "heroImageUrl",
  featuredImageId: "featuredImageUrl",
  attachmentId: "attachmentUrl",
  photoId: "photoUrl",
  storageId: "externalUrl",
  coverImageId: "coverImageUrl",
  imageId: "imageUrl",
  secondaryImageId: "secondaryImageUrl",
};

export function mediaFallbackUrl(values: Record<string, string | boolean>, storageField: string): string {
  const urlField = mediaUrlFields[storageField];
  return urlField ? String(values[urlField] ?? "").trim() : "";
}

const advancedEditorFieldKeys = new Set(["slug", "order", "expireAt", ...Object.values(mediaUrlFields)]);

export function isAdvancedEditorField(field: EditorField): boolean {
  if (field.required) return false;
  return advancedEditorFieldKeys.has(field.key) || field.key.startsWith("seo.");
}

export function editorFieldGuidance(field: EditorField): string | undefined {
  if (field.help) return field.help;
  if (field.key === "slug")
    return "Use lowercase words with hyphens, like school-news. This becomes part of the page link.";
  if (field.key === "order") return "Lower numbers appear first. Use 0 when no special order is needed.";
  if (field.type === "list") return "Separate each item with a comma.";
  if (field.type === "datetime") return "If this time is optional, you can leave it blank.";
  if (field.type === "url")
    return "Enter a link starting with https:// or a school website address starting with /.";
  return undefined;
}

export function editorSavePresentation(
  editing: AdminRecord | null,
  singular: string,
): { actionLabel: string; description: string; live: boolean } {
  if (!editing) {
    return {
      actionLabel: "Save draft",
      description:
        singular === "teacher"
          ? "Save a draft to finish this profile later. Only staff can see the draft."
          : "This starts as a private draft. You can review it before publishing.",
      live: false,
    };
  }
  const status = String(editing.status ?? "draft");
  if (status === "published") {
    return {
      actionLabel: singular === "teacher" ? "Save changes to website" : `Update live ${singular}`,
      description:
        singular === "teacher"
          ? "This profile is on the website. Visitors will see the changes you save."
          : "This item is live. Saving changes updates the public website immediately.",
      live: true,
    };
  }
  if (status === "scheduled") {
    return {
      actionLabel: singular === "teacher" ? "Save scheduled profile" : `Update scheduled ${singular}`,
      description:
        singular === "teacher"
          ? "This profile will appear on the website at the time already set."
          : "This item is scheduled. Saving changes updates the version waiting to be published.",
      live: false,
    };
  }
  if (status === "archived") {
    return {
      actionLabel: singular === "teacher" ? "Save hidden profile" : `Save archived ${singular}`,
      description:
        singular === "teacher"
          ? "This profile will stay hidden from the website when you save it."
          : "This item remains hidden from the public website while it is archived.",
      live: false,
    };
  }
  return {
    actionLabel: "Save draft",
    description:
      singular === "teacher"
        ? "Only staff can see this draft until it is published."
        : "This item remains a private draft until a publisher makes it public.",
    live: false,
  };
}

function mediaFallbackAlt(values: Record<string, string | boolean>, field: EditorField): string {
  const keys =
    field.key === "secondaryImageId"
      ? ["heading", "title", "name", "slug"]
      : ["imageAlt", "title", "name", "heading", "slug"];
  for (const key of keys) {
    const value = String(values[key] ?? "").trim();
    if (value) return value;
  }
  return field.label;
}

const seoFields = [
  {
    key: "seo.title",
    label: "Title for search results",
    help: "Use up to 120 characters. This title can also appear when someone shares the link.",
  },
  {
    key: "seo.description",
    label: "Description for search results",
    type: "textarea",
    help: "Write a short description for search results and shared links. Use up to 320 characters.",
  },
  {
    key: "seo.imageUrl",
    label: "Photo link for sharing",
    type: "url",
    help: "Paste a public link to the photo people should see when they share the page.",
  },
  {
    key: "seo.noIndex",
    label: "Hide this item from search engines",
    type: "boolean",
    help: "People can still open the page if they have its link.",
  },
] as const satisfies readonly EditorField[];

const expiryField = {
  key: "expireAt",
  label: "When to hide this item",
  type: "datetime",
  help: "Leave blank to keep this item on the website. At the time you choose, it will be archived and hidden.",
} as const satisfies EditorField;

const seoContentTypes = new Set<ContentType>([
  "pages",
  "facilities",
  "programs",
  "departments",
  "teachers",
  "news",
  "notices",
  "events",
  "documents",
  "galleryAlbums",
]);

export type CollectionDefinition = {
  type: ContentType;
  singular: string;
  title: string;
  eyebrow: string;
  description: string;
  fields: readonly EditorField[];
};

const collections: Record<
  | "pages"
  | "facilities"
  | "programs"
  | "departments"
  | "leadership"
  | "teachers"
  | "news"
  | "notices"
  | "events"
  | "gallery"
  | "documents"
  | "testimonials"
  | "faqs"
  | "homeSections"
  | "homeHighlights",
  CollectionDefinition
> = {
  pages: {
    type: "pages",
    singular: "page",
    title: "Website pages",
    eyebrow: "Website structure",
    description: "Edit website pages, their main photos, and how they appear in search results.",
    fields: [
      { key: "title", label: "Page title", required: true },
      {
        key: "slug",
        label: "Last part of the page address",
        required: true,
        placeholder: "about/our-school",
        help: "Use lowercase words with hyphens, like our-school. Leave off the first /.",
      },
      { key: "summary", label: "Summary", type: "textarea" },
      { key: "body", label: "Text on the page", type: "textarea", required: true },
      {
        key: "template",
        label: "Page layout",
        type: "select",
        defaultValue: "standard",
        help: "Choose how a custom page looks. About, Academics, Admissions, and Contact use their own layouts.",
        options: [
          { label: "Standard", value: "standard" },
          { label: "Landing", value: "landing" },
          { label: "Information", value: "information" },
        ],
      },
      { key: "heroImageId", label: "Choose an uploaded banner photo", type: "media", mediaKind: "image" },
      { key: "heroImageUrl", label: "Link to the banner photo", type: "url" },
      { key: "featured", label: "Highlight this page", type: "boolean" },
    ],
  },
  facilities: {
    type: "facilities",
    singular: "facility",
    title: "Facilities",
    eyebrow: "School environment",
    description: "Describe school facilities and record where each detail was confirmed.",
    fields: [
      { key: "name", label: "Facility name", required: true, placeholder: "Computer laboratory" },
      {
        key: "slug",
        label: "Last part of the facility link",
        required: true,
        placeholder: "computer-laboratory",
        help: "Use lowercase words separated by hyphens. This creates the direct link on the Facilities page.",
      },
      { key: "summary", label: "Short description for the card", type: "textarea", required: true },
      {
        key: "details",
        label: "Additional details",
        type: "textarea",
        help: "Only include details the school has confirmed, including who can use the facility and when.",
      },
      {
        key: "iconKey",
        label: "Facility icon",
        type: "select",
        required: true,
        defaultValue: "classroom",
        options: [
          { label: "Classroom", value: "classroom" },
          { label: "Science", value: "science" },
          { label: "Computer", value: "computer" },
          { label: "Library", value: "library" },
          { label: "Outdoor sports", value: "sports" },
          { label: "Indoor sports", value: "indoor-sports" },
          { label: "Hostel", value: "hostel" },
          { label: "Dining or canteen", value: "dining" },
          { label: "Medical and first aid", value: "medical" },
          { label: "Transport", value: "transport" },
          { label: "Auditorium", value: "auditorium" },
          { label: "School grounds", value: "grounds" },
        ],
      },
      {
        key: "verificationStatus",
        label: "Has the school confirmed these details?",
        type: "select",
        required: true,
        defaultValue: "school_confirmation_required",
        help: "Choose “Needs school confirmation” until the school checks the details.",
        options: [
          { label: "School-confirmed", value: "confirmed" },
          { label: "Needs school confirmation", value: "school_confirmation_required" },
        ],
      },
      {
        key: "sourceLabel",
        label: "Who or what confirmed the details?",
        placeholder: "SAMPADA 2082 annual magazine",
        help: "Name the school or official record that supports this facility description.",
      },
      { key: "sourceUrl", label: "Link to the source", type: "url" },
      { key: "imageId", label: "Choose an uploaded facility photo", type: "media", mediaKind: "image" },
      { key: "imageUrl", label: "Link to the facility photo", type: "url" },
      {
        key: "imageAlt",
        label: "Image description",
        help: "Describe what is visibly shown for visitors using a screen reader.",
      },
      { key: "featured", label: "Highlight this facility", type: "boolean" },
      { key: "order", label: "Order in the list", type: "number", defaultValue: "0" },
    ],
  },
  programs: {
    type: "programs",
    singular: "programme",
    title: "Academic programmes",
    eyebrow: "Teaching and learning",
    description: "Edit each programme’s grades, subjects, learning goals, and photos.",
    fields: [
      { key: "name", label: "Programme name", required: true },
      { key: "slug", label: "Last part of the page address", required: true, placeholder: "primary" },
      { key: "shortDescription", label: "Short description for the card", type: "textarea", required: true },
      { key: "description", label: "About the programme", type: "textarea", required: true },
      { key: "gradeRange", label: "Grade range" },
      { key: "curriculum", label: "Curriculum", type: "textarea" },
      {
        key: "outcomes",
        label: "What students will learn",
        type: "list",
        help: "Put a comma between each learning goal.",
      },
      { key: "heroImageId", label: "Choose an uploaded banner photo", type: "media", mediaKind: "image" },
      { key: "heroImageUrl", label: "Link to the banner photo", type: "url" },
      { key: "featured", label: "Highlight this programme", type: "boolean" },
      { key: "order", label: "Order in the list", type: "number", defaultValue: "0" },
    ],
  },
  departments: {
    type: "departments",
    singular: "department",
    title: "Academic departments",
    eyebrow: "Teaching and learning",
    description: "Add or edit what each department teaches, who leads it, and how people can get in touch.",
    fields: [
      { key: "name", label: "Department name", required: true },
      {
        key: "slug",
        label: "Last part of the page address",
        help: "Use lowercase words with hyphens, like computer-science.",
        required: true,
        placeholder: "science",
      },
      { key: "description", label: "What does this department teach?", type: "textarea", required: true },
      {
        key: "responsibilities",
        label: "What does this department do?",
        type: "list",
        help: "Put a comma between each task.",
      },
      { key: "email", label: "Email shown on the website" },
      { key: "phone", label: "Phone number shown on the website" },
      {
        key: "headTeacherId",
        label: "Teacher who leads this department",
        type: "reference",
        referenceType: "teachers",
        referenceStatus: "published",
        referenceMatchCurrentIdBy: "departmentId",
        help: "Choose a teacher from this department whose profile is on the website.",
      },
      { key: "featured", label: "Highlight this department on the website", type: "boolean" },
      {
        key: "order",
        label: "Order in the list",
        help: "Lower numbers appear first. Leave this at 0 to use the usual order.",
        type: "number",
        defaultValue: "0",
      },
    ],
  },
  leadership: {
    type: "leadership",
    singular: "profile",
    title: "Leadership",
    eyebrow: "People",
    description: "Add school leaders, their photos, welcome messages, and public contact details.",
    fields: [
      { key: "name", label: "Full name", required: true },
      { key: "role", label: "Role", required: true },
      { key: "bio", label: "About this person", type: "textarea", required: true },
      { key: "quote", label: "Welcome message", type: "textarea" },
      { key: "photoId", label: "Choose an uploaded photo", type: "media", mediaKind: "image" },
      { key: "photoUrl", label: "Link to the photo", type: "url" },
      { key: "email", label: "Email shown on the website", type: "text" },
      { key: "order", label: "Order in the list", type: "number", defaultValue: "0" },
    ],
  },
  teachers: {
    type: "teachers",
    singular: "teacher",
    title: "Teachers",
    eyebrow: "People",
    description: "Add or update teacher profiles for the school website.",
    fields: [
      { key: "name", label: "Full name", required: true },
      {
        key: "slug",
        label: "Last part of the profile link",
        required: true,
        help: "Use lowercase letters and hyphens, like sita-shah.",
      },
      { key: "title", label: "Job title", required: true },
      {
        key: "departmentId",
        label: "Department",
        type: "reference",
        referenceType: "departments",
        help: "Choose the department where this teacher works.",
      },
      { key: "bio", label: "About the teacher", type: "textarea", required: true },
      {
        key: "qualifications",
        label: "Qualifications",
        type: "list",
        help: "Put a comma between each qualification.",
      },
      {
        key: "subjects",
        label: "Subjects taught",
        type: "list",
        help: "Put a comma between subjects, like Maths, Science.",
      },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone number" },
      { key: "showContact", label: "Show the email and phone number on the website", type: "boolean" },
      { key: "photoId", label: "Choose an uploaded teacher photo", type: "media", mediaKind: "image" },
      {
        key: "photoUrl",
        label: "Link to the teacher’s photo",
        type: "url",
        help: "If you haven’t chosen an uploaded photo, enter a link to the photo here.",
      },
      {
        key: "order",
        label: "Order in the teachers list",
        help: "Lower numbers appear first. Leave this at 0 to use the usual order.",
        type: "number",
        defaultValue: "0",
      },
    ],
  },
  news: {
    type: "news",
    singular: "story",
    title: "News",
    eyebrow: "Publishing",
    description: "Write school news, add a photo, and choose when to publish it.",
    fields: [
      { key: "title", label: "Headline", required: true },
      { key: "slug", label: "Last part of the story link", required: true },
      { key: "excerpt", label: "Short summary", type: "textarea", required: true },
      { key: "body", label: "Story text", type: "textarea", required: true },
      { key: "category", label: "Category", required: true },
      { key: "tags", label: "Tags", type: "list" },
      { key: "authorName", label: "Author" },
      {
        key: "featuredImageId",
        label: "Choose an uploaded story photo",
        type: "media",
        mediaKind: "image",
      },
      { key: "featuredImageUrl", label: "Link to the story photo", type: "url" },
      { key: "featured", label: "Highlight this story", type: "boolean" },
    ],
  },
  notices: {
    type: "notices",
    singular: "notice",
    title: "Notices",
    eyebrow: "Publishing",
    description: "Write a notice, choose who it is for, and set when it should appear.",
    fields: [
      { key: "title", label: "Notice title", required: true },
      { key: "slug", label: "Last part of the notice link", required: true },
      { key: "summary", label: "Summary", type: "textarea" },
      { key: "body", label: "Notice details", type: "textarea", required: true },
      {
        key: "priority",
        label: "Priority",
        type: "select",
        required: true,
        defaultValue: "normal",
        options: [
          { label: "Normal", value: "normal" },
          { label: "Important", value: "important" },
          { label: "Urgent", value: "urgent" },
        ],
      },
      {
        key: "audiences",
        label: "Who is this notice for?",
        type: "list",
        required: true,
        placeholder: "students, parents",
      },
      { key: "attachmentId", label: "Choose an uploaded file", type: "media", mediaKind: "document" },
      { key: "attachmentUrl", label: "Link to the attached file", type: "url" },
      { key: "startAt", label: "Start showing this notice on", type: "datetime" },
    ],
  },
  events: {
    type: "events",
    singular: "event",
    title: "Events",
    eyebrow: "Publishing",
    description: "Set event dates, locations, and how people can sign up.",
    fields: [
      { key: "title", label: "Event title", required: true },
      { key: "slug", label: "Last part of the event link", required: true },
      { key: "summary", label: "Summary", type: "textarea" },
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "startAt", label: "Starts", type: "datetime", required: true },
      { key: "endAt", label: "Ends", type: "datetime", required: true },
      { key: "timezone", label: "Time zone", required: true, defaultValue: "Asia/Kathmandu" },
      { key: "venue", label: "Location" },
      { key: "isOnline", label: "Online event", type: "boolean" },
      { key: "meetingUrl", label: "Online meeting link", type: "url" },
      { key: "capacity", label: "Maximum number of people", type: "number" },
      { key: "registrationEnabled", label: "Let people sign up", type: "boolean" },
      { key: "featuredImageId", label: "Choose an uploaded cover photo", type: "media", mediaKind: "image" },
      { key: "featuredImageUrl", label: "Link to the cover photo", type: "url" },
      { key: "featured", label: "Highlight this event", type: "boolean" },
    ],
  },
  gallery: {
    type: "galleryAlbums",
    singular: "album",
    title: "Gallery albums",
    eyebrow: "Publishing",
    description: "Group school photos and videos into albums. Upload new files in the media library.",
    fields: [
      { key: "title", label: "Album title", required: true },
      { key: "slug", label: "Last part of the album link", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "coverImageId", label: "Choose an uploaded cover photo", type: "media", mediaKind: "image" },
      { key: "coverImageUrl", label: "Link to the cover photo", type: "url" },
      { key: "eventDate", label: "Event date", type: "datetime" },
      { key: "featured", label: "Highlight this album", type: "boolean" },
      { key: "order", label: "Order in the list", type: "number", defaultValue: "0" },
    ],
  },
  documents: {
    type: "documents",
    singular: "document",
    title: "Documents",
    eyebrow: "Publishing",
    description: "Add forms and documents for families to download.",
    fields: [
      { key: "title", label: "Document title", required: true },
      { key: "slug", label: "Last part of the document link", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "category", label: "Category", required: true },
      { key: "storageId", label: "Choose an uploaded file", type: "media", mediaKind: "document" },
      { key: "externalUrl", label: "Link to a document on another site", type: "url" },
      { key: "fileName", label: "File name" },
      { key: "mimeType", label: "File type (for example, application/pdf)" },
      { key: "size", label: "Size in bytes", type: "number" },
      { key: "schoolYear", label: "School year" },
      { key: "featured", label: "Highlight this document", type: "boolean" },
      { key: "order", label: "Order in the list", type: "number", defaultValue: "0" },
    ],
  },
  testimonials: {
    type: "testimonials",
    singular: "testimonial",
    title: "Testimonials",
    eyebrow: "School community",
    description:
      "Share approved comments from students, families, former students, staff, and school partners.",
    fields: [
      { key: "name", label: "Person's name", required: true },
      { key: "role", label: "How this person is connected to the school" },
      { key: "organization", label: "Organization" },
      { key: "quote", label: "What the person said", type: "textarea", required: true },
      { key: "photoId", label: "Choose an uploaded photo", type: "media", mediaKind: "image" },
      { key: "photoUrl", label: "Link to the photo", type: "url" },
      { key: "order", label: "Order in the list", type: "number", defaultValue: "0" },
    ],
  },
  faqs: {
    type: "faqs",
    singular: "question",
    title: "Frequently asked questions",
    eyebrow: "Visitor support",
    description: "Add approved answers for the admissions page and Ask NPS.",
    fields: [
      { key: "question", label: "Question", type: "textarea", required: true },
      { key: "answer", label: "Approved answer", type: "textarea", required: true },
      { key: "category", label: "Category", placeholder: "Admissions" },
      { key: "order", label: "Order in the list", type: "number", defaultValue: "0" },
    ],
  },
  homeSections: {
    type: "homeSections",
    singular: "section",
    title: "Home page sections",
    eyebrow: "Home page",
    description:
      "Edit the text and photos in each homepage section. Publish a section to show it to visitors.",
    fields: [
      {
        key: "slug",
        label: "Section",
        type: "select",
        required: true,
        defaultValue: "about",
        help: "You can publish one version of each section at a time.",
        options: [
          { label: "Headline above the homepage slides", value: "hero" },
          { label: "About the school", value: "about" },
          { label: "Message from the management", value: "management" },
          { label: "News and events", value: "news" },
          { label: "ECA activities", value: "eca" },
          { label: "Photo gallery", value: "gallery" },
          { label: "What our alumni say", value: "alumni" },
        ],
      },
      {
        key: "eyebrow",
        label: "Small heading above the title",
        placeholder: "About the school",
        help: "The small uppercase label above the heading.",
      },
      { key: "heading", label: "Heading", type: "textarea", required: true },
      { key: "body", label: "Opening paragraph", type: "textarea" },
      {
        key: "secondaryBody",
        label: "Second paragraph",
        type: "textarea",
        help: "Used by the About section only.",
      },
      { key: "imageId", label: "Choose the main photo", type: "media", mediaKind: "image" },
      { key: "imageUrl", label: "Link to the main photo", type: "url" },
      { key: "imageAlt", label: "Image description", help: "Describes the image for screen readers." },
      {
        key: "secondaryImageId",
        label: "Choose the smaller photo",
        type: "media",
        mediaKind: "image",
      },
      { key: "secondaryImageUrl", label: "Link to the smaller photo", type: "url" },
      { key: "ctaLabel", label: "Text people click", placeholder: "Discover our school" },
      { key: "ctaHref", label: "Where the link goes", placeholder: "/about" },
    ],
  },
  homeHighlights: {
    type: "homeHighlights",
    singular: "card",
    title: "Home page cards",
    eyebrow: "Home page",
    description:
      "Edit homepage slides, school values, and activity cards. Publish a card to show it on the homepage.",
    fields: [
      {
        key: "section",
        label: "Belongs to",
        type: "select",
        required: true,
        defaultValue: "eca",
        options: [
          { label: "Homepage slide", value: "hero" },
          { label: "School value in the About section", value: "about" },
          { label: "School activity card", value: "eca" },
        ],
      },
      { key: "title", label: "Title", required: true },
      {
        key: "summary",
        label: "Summary",
        type: "textarea",
        help: "For homepage slides, this text appears below the slideshow.",
      },
      {
        key: "icon",
        label: "Icon",
        type: "select",
        defaultValue: "",
        help: "Icons appear on school value and activity cards only.",
        options: [
          { label: "None", value: "" },
          { label: "Trophy (sport)", value: "trophy" },
          { label: "Shield (discipline)", value: "shield" },
          { label: "Music", value: "music" },
          { label: "Debate", value: "debate" },
          { label: "Science", value: "science" },
          { label: "Service", value: "service" },
          { label: "Book (learning)", value: "book" },
          { label: "Sparkles (dignity)", value: "sparkles" },
        ],
      },
      { key: "imageId", label: "Choose an uploaded image", type: "media", mediaKind: "image" },
      { key: "imageUrl", label: "Link to the image", type: "url" },
      {
        key: "imageAlt",
        label: "Image description",
        help: "Describe the photo for visitors who cannot see it. This is required for slides and activity cards.",
      },
      { key: "href", label: "Where the link goes", placeholder: "/campus-life/activities" },
      { key: "order", label: "Order in the list", type: "number", defaultValue: "0" },
    ],
  },
};

export type CollectionKey = keyof typeof collections;

const departmentFieldWording: Record<string, Pick<EditorField, "label" | "help">> = {
  "seo.title": {
    label: "Title for search results",
    help: "Use up to 120 characters. This title can also appear when someone shares the link.",
  },
  "seo.description": {
    label: "Description for search results",
    help: "Describe the department in up to 320 characters. This can also appear when someone shares the link.",
  },
  "seo.imageUrl": {
    label: "Photo link for sharing",
    help: "Paste a public link to the photo you want people to see when they share this page.",
  },
  "seo.noIndex": {
    label: "Hide this page from search results",
    help: "People can still open the page if they have its link.",
  },
  expireAt: { label: "When to hide this page", help: "Leave this blank to keep the page on the website." },
};

const teacherFieldWording: typeof departmentFieldWording = {
  ...departmentFieldWording,
  "seo.description": {
    label: "Description for search results",
    help: "Describe the teacher in up to 320 characters. This can also appear when someone shares the profile link.",
  },
};

export function getCollectionDefinition(collection: CollectionKey): CollectionDefinition {
  const definition = collections[collection];
  const fields = [
    ...definition.fields,
    ...(seoContentTypes.has(definition.type) ? seoFields : []),
    expiryField,
  ];
  const wording =
    collection === "teachers"
      ? teacherFieldWording
      : collection === "departments"
        ? departmentFieldWording
        : undefined;
  return {
    ...definition,
    fields: wording ? fields.map((field) => ({ ...field, ...wording[field.key] })) : fields,
  };
}

export function AdminCollectionPage({
  collection,
  children,
  initialSearch = "",
}: {
  collection: CollectionKey;
  children?: ReactNode;
  initialSearch?: string;
}) {
  const definition = getCollectionDefinition(collection);
  return (
    <>
      <PageHeading
        eyebrow={definition.eyebrow}
        title={definition.title}
        description={definition.description}
      />
      {children}
      <AdminCollectionScreen definition={definition} initialSearch={initialSearch} />
    </>
  );
}

export function AdminCollectionScreen({
  definition,
  initialSearch = "",
}: {
  definition: CollectionDefinition;
  initialSearch?: string;
}) {
  return (
    <AdminFeatureGate requiredRoles={ADMIN_ACCESS_ROLES.content}>
      <CollectionManager
        key={`${definition.type}:${initialSearch}`}
        definition={definition}
        initialSearch={initialSearch}
      />
    </AdminFeatureGate>
  );
}

function CollectionManager({
  definition,
  initialSearch,
}: {
  definition: CollectionDefinition;
  initialSearch: string;
}) {
  const viewer = useQuery(usersApi.current, {});
  const [filter, setFilter] = useState<"all" | PublicationStatus>("all");
  const [search, setSearch] = useState(initialSearch);
  const [editing, setEditing] = useState<AdminRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<{ item: AdminRecord; value: string } | null>(null);
  const {
    results,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(
    adminApi.listContent,
    {
      type: definition.type,
      ...(filter === "all" ? {} : { status: filter }),
    },
    { initialNumItems: 50 },
  );
  const upsert = useMutation(adminApi.upsertContent);
  const remove = useMutation(adminApi.removeContent);
  const changeStatus = useMutation(adminApi.changeContentStatus);
  const viewerRoles = Array.isArray(viewer?.roles) ? viewer.roles.map(String) : [];
  const canPublish = viewerRoles.includes("admin") || viewerRoles.includes("publisher");

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return results;
    return results.filter((item) =>
      [item.title, item.name, item.question, item.category, item.slug].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(term),
      ),
    );
  }, [results, search]);

  function defaultValues() {
    return Object.fromEntries(
      definition.fields.map((field) => [
        field.key,
        field.defaultValue ?? (field.type === "boolean" ? false : ""),
      ]),
    ) as Record<string, string | boolean>;
  }

  function openNew() {
    setEditing(null);
    setValues(defaultValues());
    setError(null);
    setSuccess(null);
    setEditorOpen(true);
  }

  function openEdit(item: AdminRecord) {
    const next = defaultValues();
    for (const field of definition.fields) {
      const raw = editorRecordValue(item, field.key);
      if (field.type === "boolean") next[field.key] = Boolean(raw);
      else if (field.type === "list") next[field.key] = Array.isArray(raw) ? raw.join(", ") : "";
      else if (field.type === "datetime") next[field.key] = typeof raw === "number" ? toLocalInput(raw) : "";
      else next[field.key] = raw == null ? "" : String(raw);
    }
    setEditing(item);
    setValues(next);
    setError(null);
    setSuccess(null);
    setEditorOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const data: Record<string, unknown> = {
        status: (editing?.status as PublicationStatus | undefined) ?? "draft",
      };
      if (editing) {
        for (const key of [
          "heroImageId",
          "featuredImageId",
          "attachmentId",
          "photoId",
          "storageId",
          "coverImageId",
          "publishAt",
          "featured",
          "order",
        ]) {
          if (editing[key] !== undefined) data[key] = editing[key];
        }
      }
      if (definition.fields.some((field) => isSeoEditorField(field.key))) {
        data.seo = seoInputFromEditor(values);
      }
      for (const field of definition.fields) {
        if (isSeoEditorField(field.key)) continue;
        const value = values[field.key];
        if (field.type === "boolean") {
          data[field.key] = Boolean(value);
          continue;
        }
        const text = String(value ?? "").trim();
        if (field.type === "list") {
          data[field.key] = text
            ? text
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
            : [];
          continue;
        }
        if (field.type === "media") {
          if (text) data[field.key] = text;
          else delete data[field.key];
          continue;
        }
        if (!text && field.required) throw new Error(`${field.label} is required.`);
        if (!text) continue;
        if (field.type === "number") data[field.key] = Number(text);
        else if (field.type === "datetime") data[field.key] = editorDateValue(text, field.label);
        else data[field.key] = text;
      }
      if (definition.type === "documents" && !data.externalUrl && !data.storageId)
        throw new Error("Provide a document URL or attach a stored media file before saving.");
      await upsert({
        payload: { type: definition.type, ...(editing ? { id: editing._id } : {}), data },
      });
      setEditorOpen(false);
      setEditing(null);
      setSuccess(`${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} saved.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(item: AdminRecord) {
    const label = itemLabel(item);
    if (!window.confirm(`Permanently delete “${label}”? This action is recorded and cannot be undone.`))
      return;
    setError(null);
    setSuccess(null);
    try {
      await remove({ type: definition.type, id: item._id });
      setSuccess(`${label} deleted.`);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function setPublication(item: AdminRecord, status: PublicationStatus, publishAt?: number) {
    setError(null);
    setSuccess(null);
    try {
      await changeStatus({
        type: definition.type,
        id: item._id,
        status,
        ...(publishAt ? { publishAt } : {}),
      });
      setSuccess(
        status === "scheduled" ? `${itemLabel(item)} scheduled.` : `${itemLabel(item)} moved to ${status}.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (paginationStatus === "LoadingFirstPage")
    return <LoadingPanel label={`Loading ${definition.title.toLowerCase()}`} />;

  return (
    <section>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search {definition.title}</span>
          <Search className="absolute top-3.5 left-3.5 text-slate-400" size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-xl border border-slate-200 py-3 pr-3 pl-10 text-sm outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100"
            placeholder={`Search ${definition.title.toLowerCase()}…`}
          />
        </label>
        <label>
          <span className="sr-only">Filter publication status</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold outline-none focus:border-sky-600 sm:w-44"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button onClick={openNew} className={`${primaryButtonClass} w-full sm:w-auto`}>
          <Plus size={17} /> Add {definition.singular}
        </button>
      </div>
      <div className="mb-5 space-y-3">
        {viewer !== undefined && !canPublish && (
          <Feedback kind="info">
            You can create and edit draft content. Publishing, scheduling, archiving, and deletion require a
            publisher or administrator.
          </Feedback>
        )}
        {error && <Feedback>{error}</Feedback>}
        {success && <Feedback kind="success">{success}</Feedback>}
      </div>
      {items.length === 0 ? (
        <EmptyState
          title={`No ${definition.title.toLowerCase()} found`}
          description={
            search || filter !== "all"
              ? "Try clearing the current search or status filter."
              : `Create the first ${definition.singular} when verified content is ready.`
          }
          action={
            search || filter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
                className={secondaryButtonClass}
              >
                Clear filters
              </button>
            ) : (
              <button onClick={openNew} className={primaryButtonClass}>
                <Plus size={17} /> Add {definition.singular}
              </button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_140px_170px_190px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-extrabold tracking-[.14em] text-slate-500 uppercase xl:grid">
            <span>Content</span>
            <span>Status</span>
            <span>Publication</span>
            <span className="text-right">Actions</span>
          </div>
          {items.map((item) => (
            <article
              key={item._id}
              className="grid gap-4 border-b border-slate-100 p-4 last:border-0 sm:p-5 xl:grid-cols-[minmax(0,1.5fr)_140px_170px_190px] xl:items-center"
            >
              <div className="min-w-0">
                <h2 className="truncate font-extrabold text-slate-900">{itemLabel(item)}</h2>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {item.slug
                    ? `/${String(item.slug)}`
                    : item._creationTime
                      ? `Created ${formatDate(item._creationTime)}`
                      : "No route assigned"}
                </p>
                {typeof item.expireAt === "number" && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    Expires {formatDate(item.expireAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 xl:block">
                <span className="text-[10px] font-extrabold tracking-[.14em] text-slate-400 uppercase xl:hidden">
                  Status
                </span>
                <StatusBadge status={String(item.status ?? "draft")} />
              </div>
              {canPublish ? (
                <label className="flex items-center justify-between gap-3 xl:block">
                  <span className="text-[10px] font-extrabold tracking-[.14em] text-slate-400 uppercase xl:sr-only">
                    Publication
                  </span>
                  <select
                    aria-label={`Publication status for ${itemLabel(item)}`}
                    value={String(item.status ?? "draft")}
                    onChange={(event) => {
                      const next = event.target.value as PublicationStatus;
                      if (next === "scheduled") setSchedule({ item, value: "" });
                      else void setPublication(item, next);
                    }}
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold outline-none focus:border-sky-600 xl:w-full"
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Schedule…</option>
                    <option value="published">Publish now</option>
                    <option value="archived">Archive</option>
                  </select>
                </label>
              ) : (
                <span
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-500"
                  title="Publisher or administrator access is required"
                >
                  <LockKeyhole size={14} /> Publisher approval
                </span>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 xl:justify-end xl:border-0 xl:pt-0">
                <span className="text-[10px] font-extrabold tracking-[.14em] text-slate-400 uppercase xl:hidden">
                  Actions
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  <button
                    onClick={() => openEdit(item)}
                    disabled={!canPublish && (item.status === "published" || item.status === "scheduled")}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                    aria-label={`Edit ${itemLabel(item)}`}
                    title={
                      !canPublish && (item.status === "published" || item.status === "scheduled")
                        ? "A publisher must return this item to draft before an editor can revise it"
                        : undefined
                    }
                  >
                    <Pencil size={17} />
                    Edit
                  </button>
                  {canPublish && (
                    <button
                      onClick={() => void deleteItem(item)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50"
                      aria-label={`Delete ${itemLabel(item)}`}
                    >
                      <Trash2 size={17} />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <PaginationControls
        status={paginationStatus}
        loadedCount={results.length}
        noun="content records"
        onLoadMore={() => loadMore(50)}
      />

      {editorOpen && (
        <EditorModal
          definition={definition}
          editing={editing}
          values={values}
          setValues={setValues}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) setEditorOpen(false);
          }}
          onSubmit={save}
        />
      )}
      {schedule && (
        <ScheduleDialog
          item={schedule.item}
          value={schedule.value}
          setValue={(value) => setSchedule({ ...schedule, value })}
          busy={busy}
          onClose={() => setSchedule(null)}
          onSubmit={async (event) => {
            event.preventDefault();
            const at = new Date(schedule.value).getTime();
            if (!Number.isFinite(at) || at <= Date.now()) {
              setError("Choose a future publication time.");
              return;
            }
            setBusy(true);
            await setPublication(schedule.item, "scheduled", at);
            setBusy(false);
            setSchedule(null);
          }}
        />
      )}
    </section>
  );
}

function EditorModal({
  definition,
  editing,
  values,
  setValues,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  definition: CollectionDefinition;
  editing: AdminRecord | null;
  values: Record<string, string | boolean>;
  setValues: (values: Record<string, string | boolean>) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { dialogRef, onDialogKeyDown } = useModalAccessibility<HTMLFormElement>(true, onClose);
  const savePresentation = editorSavePresentation(editing, definition.singular);
  const simpleFormLabels = definition.type === "departments" || definition.type === "teachers";
  const mainFields = definition.fields.filter((field) => !isAdvancedEditorField(field));
  const advancedFields = definition.fields.filter(isAdvancedEditorField);

  const renderField = (field: EditorField) =>
    field.type === "media" ? (
      <MediaEditorControl
        simplePhotoLabels={definition.type === "teachers"}
        key={field.key}
        field={field}
        value={String(values[field.key] ?? "")}
        fallbackUrl={mediaFallbackUrl(values, field.key)}
        fallbackAlt={mediaFallbackAlt(values, field)}
        onSelect={(asset) => {
          const next = { ...values, [field.key]: asset ? String(asset.storageId ?? "") : "" };
          if (definition.type === "documents" && field.key === "storageId") {
            next.fileName = asset ? String(asset.fileName ?? "") : "";
            next.mimeType = asset ? String(asset.mimeType ?? "") : "";
            next.size = asset && typeof asset.size === "number" ? String(asset.size) : "";
            if (asset) next.externalUrl = "";
          }
          setValues(next);
        }}
      />
    ) : field.type === "reference" ? (
      <ReferenceEditorControl
        key={field.key}
        field={field}
        value={String(values[field.key] ?? "")}
        currentRecordId={editing?._id}
        onChange={(value) => setValues({ ...values, [field.key]: value })}
      />
    ) : (
      <EditorControl
        key={field.key}
        field={field}
        value={values[field.key]}
        onChange={(value) => setValues({ ...values, [field.key]: value })}
      />
    );

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="grid min-h-full place-items-center">
        <form
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="content-editor-title"
          tabIndex={-1}
          onKeyDown={onDialogKeyDown}
          onSubmit={onSubmit}
          className="my-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-7">
            <div>
              <p className="text-[10px] font-extrabold tracking-[.18em] text-sky-700 uppercase">
                {definition.title}
              </p>
              <h2 id="content-editor-title" className="mt-2 text-2xl font-black">
                {editing ? `Edit ${definition.singular}` : `Add ${definition.singular}`}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                {savePresentation.description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Close editor"
            >
              <X />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
            {error && (
              <div className="mb-5">
                <Feedback>{error}</Feedback>
              </div>
            )}

            {savePresentation.live && (
              <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={19} aria-hidden="true" />
                <div>
                  <p className="text-sm font-extrabold">You are editing live content</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    Review every change before saving. Visitors will see the updated version immediately.
                  </p>
                </div>
              </div>
            )}

            <fieldset>
              <legend className="text-sm font-black text-slate-900">Main information</legend>
              <p className="mt-1 text-xs leading-5 text-slate-500">Fill in each field marked with *.</p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">{mainFields.map(renderField)}</div>
            </fieldset>

            {advancedFields.length > 0 && (
              <details className="mt-7 rounded-xl border border-slate-200 bg-slate-50 open:bg-white">
                <summary className="cursor-pointer px-4 py-4 text-sm font-extrabold text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none focus:ring-inset">
                  More options
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {simpleFormLabels
                      ? "List order, search results, and when to hide the page"
                      : "Links, list order, search results, and dates"}
                  </span>
                </summary>
                <div className="border-t border-slate-200 p-4 sm:p-5">
                  <p className="mb-5 text-xs leading-5 text-slate-500">
                    You can leave these settings as they are.
                  </p>
                  <div className="grid gap-5 sm:grid-cols-2">{advancedFields.map(renderField)}</div>
                </div>
              </details>
            )}
          </div>

          <footer className="flex shrink-0 flex-col-reverse justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:px-7">
            <button type="button" onClick={onClose} disabled={busy} className={secondaryButtonClass}>
              Cancel
            </button>
            <button disabled={busy} className={primaryButtonClass}>
              {busy && <LoaderCircle className="animate-spin" size={16} />}
              {busy ? "Saving…" : savePresentation.actionLabel}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function EditorFieldLabel({ field }: { field: EditorField }) {
  return (
    <>
      {field.label}
      {field.required && (
        <>
          <span aria-hidden="true" className="ml-1 text-red-600">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      )}
    </>
  );
}

function ReferenceEditorControl({
  field,
  value,
  currentRecordId,
  onChange,
}: {
  field: EditorField;
  value: string;
  currentRecordId?: string;
  onChange: (value: string) => void;
}) {
  const referenceType = field.referenceType ?? "teachers";
  const { results, status, loadMore } = usePaginatedQuery(
    adminApi.listContent,
    { type: referenceType, ...(field.referenceStatus ? { status: field.referenceStatus } : {}) },
    { initialNumItems: 100 },
  );
  const eligibleResults = field.referenceMatchCurrentIdBy
    ? results.filter((item) => item[field.referenceMatchCurrentIdBy!] === currentRecordId)
    : results;
  const selected = eligibleResults.find((item) => item._id === value);
  const needsSavedRecord = Boolean(field.referenceMatchCurrentIdBy && !currentRecordId);
  const departmentPicker = field.key === "departmentId";
  const help = needsSavedRecord
    ? "Save the department first. Then assign a teacher with a published profile to this department and come back to choose its head."
    : (editorFieldGuidance(field) ?? "Choose a related content record.");
  const helpId = `editor-${field.key}-help`;
  return (
    <div className="sm:col-span-2">
      <label className="block text-sm font-bold text-slate-800">
        <EditorFieldLabel field={field} />
        <select
          required={field.required}
          value={value}
          disabled={status === "LoadingFirstPage" || needsSavedRecord}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={helpId}
          className={inputClass}
        >
          <option value="">
            {field.key === "headTeacherId"
              ? status === "LoadingFirstPage"
                ? "Loading teachers…"
                : "No teacher selected"
              : status === "LoadingFirstPage"
                ? departmentPicker
                  ? "Loading departments…"
                  : "Loading available records…"
                : departmentPicker
                  ? "No department selected"
                  : "No record selected"}
          </option>
          {value && !selected && (
            <option value={value}>
              {field.key === "headTeacherId"
                ? "Selected teacher"
                : departmentPicker
                  ? "Selected department"
                  : "Currently selected record"}
            </option>
          )}
          {eligibleResults.map((item) => (
            <option key={item._id} value={item._id}>
              {itemLabel(item)} · {String(item.status ?? "draft")}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span id={helpId}>{help}</span>
        {status === "CanLoadMore" && (
          <button type="button" onClick={() => loadMore(100)} className="font-bold text-sky-800">
            {departmentPicker ? "Show more departments" : "Load more options"}
          </button>
        )}
      </div>
    </div>
  );
}

export function MediaEditorControl({
  field,
  value,
  fallbackUrl,
  fallbackAlt,
  simplePhotoLabels = false,
  onSelect,
}: {
  field: EditorField;
  value: string;
  fallbackUrl: string;
  fallbackAlt: string;
  simplePhotoLabels?: boolean;
  onSelect: (asset: AdminRecord | null) => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(mediaApi.listMedia, {}, { initialNumItems: 100 });
  const assets = results.filter((asset) => {
    const mimeType = String(asset.mimeType ?? "");
    return field.mediaKind === "image" ? mimeType.startsWith("image/") : !mimeType.startsWith("video/");
  });
  const attachedAsset = useQuery(mediaApi.getMediaByStorageId, value ? { storageId: value } : "skip");
  const directAsset =
    attachedAsset &&
    (field.mediaKind === "image"
      ? String(attachedAsset.mimeType ?? "").startsWith("image/")
      : !String(attachedAsset.mimeType ?? "").startsWith("video/"))
      ? attachedAsset
      : undefined;
  const selectedInPage = assets.find((asset) => asset.storageId === value);
  const selected = selectedInPage ?? directAsset;
  const selectedUrl = typeof selected?.url === "string" ? selected.url : "";
  const previewUrl = selectedUrl || fallbackUrl;
  const previewAlt =
    (typeof selected?.alt === "string" && selected.alt.trim()) ||
    (typeof selected?.fileName === "string" && selected.fileName.trim()) ||
    fallbackAlt;
  const Icon = field.mediaKind === "image" ? ImageIcon : File;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <label className="block text-sm font-bold text-slate-800">
            <EditorFieldLabel field={field} />
            <select
              value={value}
              disabled={status === "LoadingFirstPage"}
              onChange={(event) => {
                const storageId = event.target.value;
                onSelect(assets.find((asset) => asset.storageId === storageId) ?? null);
              }}
              className={inputClass}
            >
              <option value="">
                {status === "LoadingFirstPage"
                  ? simplePhotoLabels
                    ? "Loading photos…"
                    : "Loading media library…"
                  : fallbackUrl
                    ? field.mediaKind === "image"
                      ? simplePhotoLabels
                        ? "Use the photo shown below"
                        : "Use the image shown below"
                      : "Use the linked file"
                    : simplePhotoLabels
                      ? "No photo selected"
                      : "No file selected"}
              </option>
              {value && !selectedInPage && (
                <option value={value}>
                  {String(selected?.fileName ?? (simplePhotoLabels ? "Selected photo" : "Selected file"))}
                </option>
              )}
              {assets.map((asset) => (
                <option key={asset._id} value={String(asset.storageId)}>
                  {String(asset.fileName ?? "Media file")} · {String(asset.folder ?? "general")}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              {selected
                ? `${String(selected.mimeType ?? "File")} · ${formatBytes(Number(selected.size ?? 0))}`
                : fallbackUrl
                  ? simplePhotoLabels
                    ? "Choose another photo to replace the one shown below."
                    : "The file currently comes from a link. Choose an uploaded file to replace it."
                  : value
                    ? simplePhotoLabels
                      ? "Loading the photo…"
                      : "Loading the selected file…"
                    : simplePhotoLabels
                      ? "Choose a photo from the list, or open View uploaded files to upload one."
                      : "Choose a file you already uploaded."}
            </span>
            <span className="flex items-center gap-3">
              {status === "CanLoadMore" && (
                <button type="button" onClick={() => loadMore(100)} className="font-bold text-sky-800">
                  {simplePhotoLabels ? "Show more photos" : "Load more media"}
                </button>
              )}
              <Link href="/admin/media" className="font-bold text-sky-800">
                {simplePhotoLabels ? "View uploaded files" : "Open media library"}
              </Link>
            </span>
          </div>
        </div>
      </div>
      {field.mediaKind === "image" && previewUrl && (
        <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[12rem_1fr] sm:items-center">
          <MediaThumbnail url={previewUrl} alt={previewAlt} className="h-32 rounded-lg" sizes="192px" />
          <div className="min-w-0">
            <p className="text-xs font-extrabold tracking-wide text-slate-700 uppercase">
              {simplePhotoLabels ? "Photo preview" : selected ? "Selected image" : "Image from the link"}
            </p>
            <p className="mt-2 truncate text-sm font-semibold text-slate-800" title={previewUrl}>
              {typeof selected?.fileName === "string" ? selected.fileName : previewUrl}
            </p>
            {!selected && (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {simplePhotoLabels
                  ? "This preview shows the photo before you publish it."
                  : "This image comes from a link. You can replace it with an uploaded image."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EditorControl({
  field,
  value,
  onChange,
}: {
  field: EditorField;
  value: string | boolean | undefined;
  onChange: (value: string | boolean) => void;
}) {
  const guidance = editorFieldGuidance(field);
  const helpId = guidance ? `editor-${field.key}-help` : undefined;
  if (field.type === "boolean")
    return (
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-bold sm:col-span-2">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={helpId}
          className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-500"
        />
        <span>
          <EditorFieldLabel field={field} />
          {guidance && (
            <span id={helpId} className="mt-1 block text-xs font-normal text-slate-500">
              {guidance}
            </span>
          )}
        </span>
      </label>
    );
  const common = {
    required: field.required,
    value: String(value ?? ""),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(event.target.value),
    "aria-describedby": helpId,
    className: inputClass,
  };
  return (
    <label
      className={`block text-sm font-bold text-slate-800 ${field.type === "textarea" ? "sm:col-span-2" : ""}`}
    >
      <EditorFieldLabel field={field} />
      {field.type === "textarea" ? (
        <textarea
          {...common}
          rows={field.key === "body" || field.key === "description" || field.key === "bio" ? 8 : 4}
          placeholder={field.placeholder}
        />
      ) : field.type === "select" ? (
        <select {...common}>
          {!field.required && <option value="">Select…</option>}
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          placeholder={field.placeholder}
          type={
            field.type === "url"
              ? "url"
              : field.type === "number"
                ? "number"
                : field.type === "datetime"
                  ? "datetime-local"
                  : "text"
          }
        />
      )}
      {guidance && (
        <span id={helpId} className="mt-1.5 block text-xs leading-5 font-normal text-slate-500">
          {guidance}
        </span>
      )}
    </label>
  );
}

function ScheduleDialog({
  item,
  value,
  setValue,
  busy,
  onClose,
  onSubmit,
}: {
  item: AdminRecord;
  value: string;
  setValue: (value: string) => void;
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { dialogRef, onDialogKeyDown } = useModalAccessibility<HTMLFormElement>(true, onClose);
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center">
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-publication-title"
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
        onSubmit={onSubmit}
        className="my-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <CalendarClock className="text-sky-700" />
        <h2 id="schedule-publication-title" className="mt-4 text-xl font-black">
          Schedule publication
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Choose the date and time when “{itemLabel(item)}” should appear on the website.
        </p>
        <label className="mt-5 block text-sm font-bold">
          Publication time
          <input
            required
            type="datetime-local"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className={inputClass}
          />
        </label>
        <div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={`${secondaryButtonClass} w-full sm:w-auto`}
          >
            Cancel
          </button>
          <button disabled={busy} className={`${primaryButtonClass} w-full sm:w-auto`}>
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <CalendarClock size={16} />}{" "}
            Schedule
          </button>
        </div>
      </form>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "published"
      ? "bg-emerald-50 text-emerald-700"
      : status === "scheduled"
        ? "bg-violet-50 text-violet-700"
        : status === "archived"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-50 text-amber-800";
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold capitalize ${style}`}
    >
      {status === "archived" && <Archive size={12} />}
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function itemLabel(item: AdminRecord) {
  return String(item.title ?? item.name ?? item.question ?? item.slug ?? "Untitled record");
}
export function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-NP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kathmandu",
  }).format(value);
}
function formatBytes(size: number) {
  if (!size) return "0 B";
  const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 3);
  return `${(size / 1024 ** unit).toFixed(unit ? 1 : 0)} ${["B", "KB", "MB", "GB"][unit]}`;
}
function toLocalInput(value: number) {
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed. Please try again.";
}
