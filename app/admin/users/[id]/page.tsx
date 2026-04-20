"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { apiJson } from "@/app/admin/users/actions";
import { APP_CAPABILITIES } from "@/lib/auth/roles";

type UserDetail = {
  id: string;
  email: string;
  display_name: string | null;
  auth_provider: "credentials" | "azure_ad";
  azure_oid: string | null;
  is_active: boolean;
};

type Project = { id: string; project_number: string | null; project_name: string | null };
type ProjectAccess = { project_id: string; can_read: boolean; can_write: boolean };

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const [user, setUser] = useState<UserDetail | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectAccess, setProjectAccess] = useState<ProjectAccess[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accessByProjectId = useMemo(() => {
    const map = new Map<string, ProjectAccess>();
    for (const row of projectAccess) map.set(row.project_id, row);
    return map;
  }, [projectAccess]);
  const allCapabilitiesSelected =
    APP_CAPABILITIES.length > 0 &&
    APP_CAPABILITIES.every((capability) => capabilities.includes(capability));
  const allProjectReadSelected =
    projects.length > 0 &&
    projects.every((project) => {
      const access = accessByProjectId.get(project.id);
      return access?.can_read;
    });
  const allProjectWriteSelected =
    projects.length > 0 &&
    projects.every((project) => {
      const access = accessByProjectId.get(project.id);
      return access?.can_write;
    });

  useEffect(() => {
    if (!userId) return;
    void Promise.all([
      apiJson<{ user: UserDetail; capabilities: string[]; projectAccess: ProjectAccess[] }>(
        `/api/admin/users/${userId}`,
      ),
      apiJson<{ projects: Project[]; access: ProjectAccess[] }>(
        `/api/admin/users/${userId}/project-access`,
      ),
    ])
      .then(([detail, access]) => {
        setUser(detail.user);
        setCapabilities(detail.capabilities);
        setProjectAccess(access.access);
        setProjects(access.projects);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load user."));
  }, [userId]);

  if (!user) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        {error ?? "Loading user…"}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="mb-3 text-lg font-semibold">Identity</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input value={user.email} disabled className="rounded-md bg-zinc-950 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Display name
            <input
              value={user.display_name ?? ""}
              onChange={(event) =>
                setUser((prev) => (prev ? { ...prev, display_name: event.target.value } : prev))
              }
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={user.is_active}
              onChange={(event) =>
                setUser((prev) => (prev ? { ...prev, is_active: event.target.checked } : prev))
              }
            />
            Active
          </label>
          <button
            type="button"
            className="rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
            onClick={() => {
              setMessage(null);
              setError(null);
              void apiJson(`/api/admin/users/${userId}`, {
                method: "PATCH",
                body: JSON.stringify({
                  displayName: user.display_name,
                  isActive: user.is_active,
                }),
              })
                .then(() => setMessage("Identity updated."))
                .catch((err) => setError(err instanceof Error ? err.message : "Update failed."));
            }}
          >
            Save identity
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="mb-3 text-lg font-semibold">Capabilities</h2>
        <label className="mb-3 flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={allCapabilitiesSelected}
            onChange={(event) =>
              setCapabilities(event.target.checked ? [...APP_CAPABILITIES] : [])
            }
          />
          All
        </label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {APP_CAPABILITIES.map((capability) => (
            <label key={capability} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={capabilities.includes(capability)}
                onChange={(event) => {
                  setCapabilities((prev) =>
                    event.target.checked
                      ? [...prev, capability]
                      : prev.filter((item) => item !== capability),
                  );
                }}
              />
              {capability}
            </label>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
          onClick={() => {
            setMessage(null);
            setError(null);
            void apiJson(`/api/admin/users/${userId}/capabilities`, {
              method: "PUT",
              body: JSON.stringify({ capabilities }),
            })
              .then(() => setMessage("Capabilities updated."))
              .catch((err) => setError(err instanceof Error ? err.message : "Update failed."));
          }}
        >
          Save capabilities
        </button>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="mb-3 text-lg font-semibold">Project access</h2>
        <div className="mb-3 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allProjectReadSelected}
              onChange={(event) => {
                if (event.target.checked) {
                  setProjectAccess(
                    projects.map((project) => {
                      const existing = accessByProjectId.get(project.id);
                      return {
                        project_id: project.id,
                        can_read: true,
                        can_write: existing?.can_write ?? false,
                      };
                    }),
                  );
                  return;
                }

                setProjectAccess(
                  projects.map((project) => ({
                    project_id: project.id,
                    can_read: false,
                    can_write: false,
                  })),
                );
              }}
            />
            Read (All)
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={allProjectWriteSelected}
              onChange={(event) => {
                if (event.target.checked) {
                  setProjectAccess(
                    projects.map((project) => ({
                      project_id: project.id,
                      can_read: true,
                      can_write: true,
                    })),
                  );
                  return;
                }

                setProjectAccess(
                  projects.map((project) => {
                    const existing = accessByProjectId.get(project.id);
                    return {
                      project_id: project.id,
                      can_read: existing?.can_read ?? false,
                      can_write: false,
                    };
                  }),
                );
              }}
            />
            Write (All)
          </label>
        </div>
        <div className="max-h-96 overflow-auto rounded-lg border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Read</th>
                <th className="px-3 py-2">Write</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const access = accessByProjectId.get(project.id) ?? {
                  project_id: project.id,
                  can_read: false,
                  can_write: false,
                };
                return (
                  <tr key={project.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{project.project_number ?? "—"}</span>{" "}
                      {project.project_name ?? ""}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={access.can_read}
                        onChange={(event) => {
                          setProjectAccess((prev) => {
                            const next = prev.filter((row) => row.project_id !== project.id);
                            next.push({
                              project_id: project.id,
                              can_read: event.target.checked,
                              can_write: access.can_write && event.target.checked,
                            });
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={access.can_write}
                        onChange={(event) => {
                          setProjectAccess((prev) => {
                            const next = prev.filter((row) => row.project_id !== project.id);
                            next.push({
                              project_id: project.id,
                              can_read: event.target.checked || access.can_read,
                              can_write: event.target.checked,
                            });
                            return next;
                          });
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="mt-3 rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
          onClick={() => {
            setMessage(null);
            setError(null);
            void apiJson(`/api/admin/users/${userId}/project-access`, {
              method: "PUT",
              body: JSON.stringify({ access: projectAccess }),
            })
              .then(() => setMessage("Project access updated."))
              .catch((err) => setError(err instanceof Error ? err.message : "Update failed."));
          }}
        >
          Save project access
        </button>
      </section>
    </div>
  );
}
