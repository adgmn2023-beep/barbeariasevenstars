const CACHE='seven-stars-shell-v1';
const SHELL=['/offline.html','/logo.png','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('seven-stars-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 // Nunca armazenar HTML autenticado, APIs, dados do Supabase ou respostas RSC.
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));return;}
 if(SHELL.includes(url.pathname))event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
self.addEventListener('push',event=>{let data={title:'Seven Stars Barbershop',body:'Há uma atualização no seu agendamento.',url:'/meus-agendamentos'};try{data={...data,...event.data.json()};}catch{/* Payload ausente: mensagem padrão. */}event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',data:{url:data.url}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();let url=new URL(event.notification.data?.url||'/meus-agendamentos',self.location.origin);if(url.origin!==self.location.origin)url=new URL('/',self.location.origin);event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{for(const client of clients){if(new URL(client.url).origin===url.origin){await client.navigate(url.href);return client.focus();}}return self.clients.openWindow(url.href);}));});
