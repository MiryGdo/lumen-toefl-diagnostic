# Lumen · TOEFL Diagnostic v3

Diagnóstico tipo TOEFL para hispanohablantes, con perfil de interferencia L1
y práctica adaptativa. Web app responsive con backend Supabase opcional.

## Cambios respecto a v2

### Bugs corregidos (los tres reportados después de la prueba en celular)

1. **Audio en inglés correcto.** El v2 usaba Web Speech API, que dependía de
   las voces instaladas en el OS del usuario. En celulares con voz por defecto
   en español, eso provocaba que las palabras se leyeran sílaba por sílaba
   ("ac-ti-ve" en lugar de "active"). La v3 reemplaza Web Speech por **Google
   Translate TTS**, que sirve archivos MP3 reales con voz inglesa generada
   del lado del servidor. Funciona idéntico en cualquier dispositivo.

2. **Bloqueo después de varias preguntas en móvil.** Cada vez que el alumno
   seleccionaba una opción, la app hacía un re-render completo del DOM
   (incluyendo el reproductor de audio). En móvil eso causaba freezes y
   estados inconsistentes con el `<audio>` element. Ahora `selectOption`
   solo cambia la clase `.selected` en el DOM existente.

3. **Bug de recursión infinita en `stopSpeech()`.** La función se llamaba
   a sí misma (`function stopSpeech(){ if('speechSynthesis' in window){ stopSpeech(); } }`),
   lo cual hacía freeze del navegador si por alguna razón se ejecutaba.
   Eliminada y reemplazada por `stopAudio()` que detiene los Audio elements.

### Mejoras adicionales

- **Auto-stop de audio al cambiar pregunta.** `nextQuestion`, `prevQuestion`,
  `goHome` y `finishExam` ahora llaman a `stopAudio()` para evitar que un
  audio quede sonando al cambiar de pantalla.

- **Touch targets reforzados.** Botones y opciones con min-height de 44–48px,
  inputs con `font-size: 16px` en móvil (evita zoom automático en iOS).

- **Mobile-first sticky topbar.** Con `viewport-fit=cover`, `safe-area-inset`
  y `theme-color` para integrarse mejor con el sistema operativo móvil.

- **PWA básico.** Meta tags para `apple-mobile-web-app-capable` y similares;
  los alumnos pueden agregar a su pantalla de inicio.

- **Capa visual mágica sutil.** Estrellas doradas pequeñas titilando en el
  fondo (35 en móvil, 60 en escritorio), luna sutil en la esquina superior,
  número de banda con gradiente dorado-verde. Sin saturar — mantiene la
  paleta verde/teal/cálida original.

- **Tabla `practice_attempts` ahora se llena.** Cada intento de práctica
  enfocada se guarda en Supabase para análisis longitudinal posterior.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app completa, un solo archivo HTML. |
| `claude-proxy-edge-function.ts` | Opcional. Edge Function de Supabase para conectar Claude Opus 4.7 real (Writing) y Haiku 4.5 (práctica). Sin esto la app usa fallback offline. |
| `README.md` | Este archivo. |

## Cómo correr local

```bash
python3 -m http.server 8787
```

Y abrir `http://127.0.0.1:8787/index.html` en el navegador (escritorio) o en
el celular conectado a la misma red Wi-Fi usando la IP local de tu laptop
(ej. `http://192.168.1.10:8787/index.html`).

## Configuración de Supabase

Las credenciales ya están en `index.html`. El schema SQL (5 tablas con RLS)
ya está aplicado en tu proyecto Supabase. No hay que hacer nada más para que
funcione el registro/login y guardado de resultados.

### Tablas

| Tabla | Propósito |
|---|---|
| `profiles` | Datos básicos del alumno (nombre, email) |
| `test_sessions` | Una fila por examen completado |
| `answers` | Una fila por respuesta individual (para analítica fina) |
| `writing_evaluations` | Texto original + evaluación + versión corregida |
| `practice_attempts` | Cada intento de práctica enfocada |

Todas con Row Level Security: cada alumno solo puede ver y escribir sus
propios datos.

## Audio: cómo funciona

El endpoint `translate.google.com/translate_tts` recibe texto y devuelve un
MP3 hasta ~200 caracteres. Los scripts largos (mini-lectures, conversaciones)
se dividen en oraciones y se reproducen en secuencia. La calidad es razonable
para diagnóstico — pronunciación clara, voz nativa, sin defectos del OS.

**Limitaciones:**
- El endpoint es público pero no oficial. Estable hace años pero podría
  cambiar sin aviso. Si Google bloquea por uso excesivo, la app muestra un
  error pero el resto del examen sigue funcionando (el texto del script no
  se muestra en el examen para preservar la dificultad de Listening).
- Velocidad fija (~150 wpm). No se puede ralentizar el audio.
- Acentos: Google TTS solo distingue `en` (americano) reliable. Los items
  marcados `en-GB` se reproducen con voz americana también.

**Para producción seria:** generar MP3s pre-grabados con ElevenLabs (mejor
calidad expresiva, control de acentos UK/US, sin dependencia de un endpoint
no documentado). El Marco de Desarrollo incluye el script Python para esto.

## Writing AES: cómo funciona

Si `API_PROXY_ENDPOINT` está vacío en el código (default), la app usa
**evaluación local de respaldo**: detecta patrones de interferencia L1 por
regex (impersonal it faltante, "for to + verb", falsos cognados, etc.) y
genera un puntaje aproximado por dimensión.

Para evaluación con **Claude Opus 4.7 real** (mucho más preciso y
pedagógico), despliega el `claude-proxy-edge-function.ts` en Supabase
siguiendo las instrucciones del archivo, y pega la URL resultante en
`API_PROXY_ENDPOINT` en `index.html`.

## Próximos pasos sugeridos

1. Probar la v3 en celular y verificar que los 3 bugs originales están
   resueltos.
2. Si la evaluación local de Writing te parece insuficiente, desplegar el
   Edge Function (costo aproximado <$2 USD/mes para 30 alumnos).
3. Cuando estés lista para producción, generar audios MP3 reales con
   ElevenLabs para reemplazar Google TTS.
4. Separar `index.html` en archivos (`index.html`, `styles.css`, `app.js`)
   para mantenibilidad.
5. Crear un panel de profesor que lea las tablas `test_sessions` y
   `practice_attempts` para ver el progreso de tus alumnos.

## Seguridad

- La `SUPABASE_ANON_KEY` en el código es pública por diseño. Lo que protege
  los datos es Row Level Security: cada `auth.uid()` solo puede tocar sus
  propias filas. Esto está configurado correctamente en tu schema.
- Si en algún momento decides regenerar la anon key (Supabase Dashboard →
  Settings → API → Reset anon key), reemplaza el valor en `index.html`.
- La API key de Anthropic, en cambio, **nunca debe estar en el HTML.** Por
  eso la v3 mantiene el patrón de proxy: la key vive en Supabase Secrets
  (servidor) y nunca viaja al navegador.
