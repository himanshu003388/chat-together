import { $ as $$Layout } from './Layout_C_TQ-mLw.mjs';
import { c as createComponent } from './astro-component_ChyAuDe0.mjs';
import 'piccolore';
import { Q as renderTemplate, z as maybeRenderHead, a3 as addAttribute } from './params-and-props_Bdc0UXF-.mjs';
import { r as renderComponent } from './entrypoint_CY5oGq1D.mjs';

const $$Edit = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$props, $$slots);
  Astro2.self = $$Edit;
  const user = Astro2.locals.user;
  const supabase = Astro2.locals.supabase;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user?.id).maybeSingle();
  let errorMessage = "";
  if (Astro2.request.method === "POST") {
    try {
      const formData = await Astro2.request.formData();
      const username = formData.get("username")?.toString();
      const bio = formData.get("bio")?.toString();
      const avatarFile = formData.get("avatar");
      let avatar_url = profile?.avatar_url;
      if (avatarFile && avatarFile.size > 0) {
        const fileExt = avatarFile.name.split(".").pop();
        const fileName = `${user?.id}-${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, avatarFile);
        if (uploadError) throw uploadError;
        avatar_url = fileName;
      }
      const { error: updateError } = await supabase.from("profiles").update({ username, bio, avatar_url }).eq("id", user?.id);
      if (updateError) throw updateError;
      return Astro2.redirect("/profile");
    } catch (error) {
      errorMessage = error.message;
    }
  }
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, { "title": "Edit Profile - ChatApp" }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="max-w-2xl mx-auto py-10 px-4 sm:px-6 lg:px-8 w-full"> <div class="bg-white shadow overflow-hidden sm:rounded-lg p-6"> <h3 class="text-lg leading-6 font-medium text-gray-900 mb-6">Edit Profile</h3> ${errorMessage && renderTemplate`<div class="bg-red-50 border-l-4 border-red-400 p-4 mb-6"> <div class="flex"> <div class="ml-3"> <p class="text-sm text-red-700">${errorMessage}</p> </div> </div> </div>`} <form method="post" enctype="multipart/form-data" class="space-y-6"> <div> <label class="block text-sm font-medium text-gray-700">Avatar</label> <div class="mt-1 flex items-center space-x-5"> <span class="inline-block h-12 w-12 rounded-full overflow-hidden bg-gray-100"> ${profile?.avatar_url ? renderTemplate`<img${addAttribute(`${"https://yobdetdziljwrlnqanxm.supabase.co"}/storage/v1/object/public/avatars/${profile.avatar_url}`, "src")} alt="Avatar" class="h-full w-full object-cover">` : renderTemplate`<svg class="h-full w-full text-gray-300" fill="currentColor" viewBox="0 0 24 24"> <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z"></path> </svg>`} </span> <input type="file" name="avatar" accept="image/*" class="bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"> </div> </div> <div> <label for="username" class="block text-sm font-medium text-gray-700">Username</label> <div class="mt-1"> <input type="text" name="username" id="username"${addAttribute(profile?.username, "value")} required class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md px-3 py-2 border"> </div> </div> <div> <label for="bio" class="block text-sm font-medium text-gray-700">Bio</label> <div class="mt-1"> <textarea id="bio" name="bio" rows="3" class="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md px-3 py-2">${profile?.bio}</textarea> </div> <p class="mt-2 text-sm text-gray-500">Brief description for your profile.</p> </div> <div class="flex justify-end gap-3"> <a href="/profile" class="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</a> <button type="submit" class="bg-indigo-600 border border-transparent rounded-md shadow-sm py-2 px-4 inline-flex justify-center text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
Save
</button> </div> </form> </div> </div> ` })}`;
}, "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/profile/edit.astro", void 0);
const $$file = "C:/Users/Jarvis/Desktop/New folder (2)/chat/src/pages/profile/edit.astro";
const $$url = "/profile/edit";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Edit,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
