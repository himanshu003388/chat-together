import { $ as $$Layout } from './Layout_C_TQ-mLw.mjs';
import { c as createComponent } from './astro-component_ChyAuDe0.mjs';
import 'piccolore';
import { Q as renderTemplate, z as maybeRenderHead, a3 as addAttribute } from './params-and-props_Bdc0UXF-.mjs';
import { r as renderComponent } from './entrypoint_CZzd4IbP.mjs';

const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Index;
  const user = Astro2.locals.user;
  const supabase = Astro2.locals.supabase;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user?.id).maybeSingle();
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Profile - ChatApp" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="max-w-3xl mx-auto py-10 px-4 sm:px-6 lg:px-8 w-full"> <div class="bg-white shadow overflow-hidden sm:rounded-lg"> <div class="px-4 py-5 sm:px-6 flex justify-between items-center"> <div> <h3 class="text-lg leading-6 font-medium text-gray-900">User Profile</h3> <p class="mt-1 max-w-2xl text-sm text-gray-500">Personal details and application settings.</p> </div> <a href="/profile/edit" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
Edit Profile
</a> </div> <div class="border-t border-gray-200"> <dl> <div class="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"> <dt class="text-sm font-medium text-gray-500">Avatar</dt> <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2"> ${profile?.avatar_url ? renderTemplate`<img${addAttribute(`${"https://yobdetdziljwrlnqanxm.supabase.co"}/storage/v1/object/public/avatars/${profile.avatar_url}`, "src")} alt="Avatar" class="h-16 w-16 rounded-full object-cover">` : renderTemplate`<div class="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-800 font-bold text-xl"> ${profile?.username?.charAt(0).toUpperCase()} </div>`} </dd> </div> <div class="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"> <dt class="text-sm font-medium text-gray-500">Username</dt> <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${profile?.username}</dd> </div> <div class="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"> <dt class="text-sm font-medium text-gray-500">Email address</dt> <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${profile?.email}</dd> </div> <div class="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"> <dt class="text-sm font-medium text-gray-500">Bio</dt> <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">${profile?.bio || "No bio provided."}</dd> </div> <div class="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6"> <dt class="text-sm font-medium text-gray-500">Role</dt> <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 capitalize"> <span${addAttribute(`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${profile?.role === "admin" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`, "class")}> ${profile?.role} </span> </dd> </div> </dl> </div> </div> </div> ` })}`;
}, "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/profile/index.astro", void 0);
const $$file = "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/profile/index.astro";
const $$url = "/profile";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Index,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
