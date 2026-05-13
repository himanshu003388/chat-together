import { $ as $$Layout } from './Layout_C_TQ-mLw.mjs';
import { c as createComponent } from './astro-component_ChyAuDe0.mjs';
import 'piccolore';
import { Q as renderTemplate, z as maybeRenderHead, a3 as addAttribute } from './params-and-props_Bdc0UXF-.mjs';
import { r as renderComponent } from './entrypoint_CZzd4IbP.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Index;
  const supabase = Astro2.locals.supabase;
  if (Astro2.request.method === "POST") {
    const formData = await Astro2.request.formData();
    const userId = formData.get("userId")?.toString();
    const action = formData.get("action")?.toString();
    if (userId && action) {
      if (action === "ban") {
        await supabase.from("profiles").update({ is_banned: true }).eq("id", userId);
      } else if (action === "unban") {
        await supabase.from("profiles").update({ is_banned: false }).eq("id", userId);
      }
    }
  }
  const { data: users } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Manage Users - Admin" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8"> <div class="px-4 py-6 sm:px-0"> <div class="flex justify-between items-center mb-6"> <h1 class="text-2xl font-semibold text-gray-900">Manage Users</h1> <a href="/admin" class="text-sm text-blue-600 hover:text-blue-900">&larr; Back to Dashboard</a> </div> <div class="flex flex-col"> <div class="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8"> <div class="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8"> <div class="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg"> <table class="min-w-full divide-y divide-gray-200"> <thead class="bg-gray-50"> <tr> <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th> <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th> <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th> <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th> <th scope="col" class="relative px-6 py-3"><span class="sr-only">Actions</span></th> </tr> </thead> <tbody class="bg-white divide-y divide-gray-200"> ${users?.map((user) => renderTemplate`<tr> <td class="px-6 py-4 whitespace-nowrap"> <div class="flex items-center"> <div class="flex-shrink-0 h-10 w-10"> ${user.avatar_url ? renderTemplate`<img class="h-10 w-10 rounded-full object-cover"${addAttribute(user.avatar_url, "src")} alt="">` : renderTemplate`<div class="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold"> ${user.username.charAt(0).toUpperCase()} </div>`} </div> <div class="ml-4"> <div class="text-sm font-medium text-gray-900">${user.username}</div> <div class="text-sm text-gray-500">${user.email}</div> </div> </div> </td> <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize"> ${user.role} </td> <td class="px-6 py-4 whitespace-nowrap"> <span${addAttribute(`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.is_banned ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`, "class")}> ${user.is_banned ? "Banned" : "Active"} </span> </td> <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500"> ${new Date(user.created_at).toLocaleDateString()} </td> <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"> ${user.role !== "admin" && renderTemplate`<form method="POST" class="inline"> <input type="hidden" name="userId"${addAttribute(user.id, "value")}> ${user.is_banned ? renderTemplate`<button type="submit" name="action" value="unban" class="text-green-600 hover:text-green-900">Unban</button>` : renderTemplate`<button type="submit" name="action" value="ban" class="text-red-600 hover:text-red-900">Ban</button>`} </form>`} </td> </tr>`)} </tbody> </table> </div> </div> </div> </div> </div> </div> ` })}`;
}, "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/admin/users/index.astro", void 0);

const $$file = "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/admin/users/index.astro";
const $$url = "/admin/users";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
