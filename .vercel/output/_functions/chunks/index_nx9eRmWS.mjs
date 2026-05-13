import { $ as $$Layout } from './Layout_C_TQ-mLw.mjs';
import { c as createComponent } from './astro-component_ChyAuDe0.mjs';
import 'piccolore';
import { Q as renderTemplate, z as maybeRenderHead, a3 as addAttribute } from './params-and-props_Bdc0UXF-.mjs';
import { r as renderComponent } from './entrypoint_CZzd4IbP.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Index;
  const user = Astro2.locals.user;
  const { data: profile } = await Astro2.locals.supabase.from("profiles").select("role").eq("id", user?.id).maybeSingle();
  if (profile?.role !== "admin") {
    return Astro2.redirect("/");
  }
  const { count: userCount } = await Astro2.locals.supabase.from("profiles").select("*", { count: "exact", head: true });
  const { count: messageCount } = await Astro2.locals.supabase.from("messages").select("*", { count: "exact", head: true });
  const { data: recentUsers } = await Astro2.locals.supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(5);
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Admin Dashboard" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="mb-8"> <h1 class="text-3xl font-bold text-gray-900">Admin Dashboard</h1> <p class="text-gray-500 mt-1">Manage users and monitor application statistics.</p> </div> <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"> <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center"> <div class="p-3 rounded-full bg-indigo-100 text-indigo-600 mr-4"> <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path> </svg> </div> <div> <p class="text-sm font-medium text-gray-500">Total Users</p> <p class="text-2xl font-bold text-gray-900">${userCount}</p> </div> </div> <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100 flex items-center"> <div class="p-3 rounded-full bg-green-100 text-green-600 mr-4"> <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path> </svg> </div> <div> <p class="text-sm font-medium text-gray-500">Total Messages</p> <p class="text-2xl font-bold text-gray-900">${messageCount}</p> </div> </div> </div> <div class="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden"> <div class="p-6 border-b border-gray-100 flex justify-between items-center"> <h2 class="text-lg font-semibold text-gray-900">Recent Users</h2> <a href="/admin/users" class="text-sm text-indigo-600 font-medium hover:text-indigo-800">View All</a> </div> <div class="overflow-x-auto"> <table class="min-w-full divide-y divide-gray-200"> <thead class="bg-gray-50"> <tr> <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th> <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th> <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th> <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th> </tr> </thead> <tbody class="bg-white divide-y divide-gray-200"> ${recentUsers?.map((u) => renderTemplate`<tr> <td class="px-6 py-4 whitespace-nowrap"> <div class="flex items-center"> <div class="flex-shrink-0 h-10 w-10"> ${u.avatar_url ? renderTemplate`<img class="h-10 w-10 rounded-full object-cover"${addAttribute(u.avatar_url, "src")} alt="">` : renderTemplate`<div class="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold"> ${u.username.charAt(0).toUpperCase()} </div>`} </div> <div class="ml-4"> <div class="text-sm font-medium text-gray-900">${u.username}</div> <div class="text-sm text-gray-500">${u.email}</div> </div> </div> </td> <td class="px-6 py-4 whitespace-nowrap"> <span${addAttribute(`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.role === "admin" ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-800"}`, "class")}> ${u.role} </span> </td> <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500"> ${new Date(u.created_at).toLocaleDateString()} </td> <td class="px-6 py-4 whitespace-nowrap"> <span${addAttribute(`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${u.is_banned ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`, "class")}> ${u.is_banned ? "Banned" : "Active"} </span> </td> </tr>`)} </tbody> </table> </div> </div> ` })}`;
}, "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/admin/index.astro", void 0);

const $$file = "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/admin/index.astro";
const $$url = "/admin";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
