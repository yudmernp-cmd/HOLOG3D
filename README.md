# HoloMotion 3D

Laboratorio interactivo de gráficos 3D y seguimiento real de manos. React, TypeScript estricto, Vite, Three.js, Tailwind CSS y MediaPipe Hand Landmarker. Sin claves ni servicios comerciales.

## Inicio

Requisitos: Node.js 22 o 24, npm, navegador moderno con WebGL y cámara opcional. La cámara requiere HTTPS o localhost.

```sh
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

La instalación copia el runtime WASM de MediaPipe y descarga su modelo oficial desde `storage.googleapis.com`. Se sirven desde el mismo origen en ejecución: las imágenes de la webcam no se transmiten ni se graban. Para instalaciones reproducibles usa `npm ci`. Si tu entorno no permite escribir en la caché predeterminada, usa `npm ci --cache /tmp/holomotion-npm`. Para desplegar, sirve `dist/` por HTTPS; incluye los archivos WASM y el modelo generados. La descarga inicial requiere Internet.

## Uso

- Activa la cámara y acepta el permiso. Muestra la mano completa con luz suficiente. El video se muestra en espejo por defecto; el botón espejo también transforma los gráficos.
- **Partículas:** siete figuras interpoladas. Palma abierta expande, puño concentra, palma desplaza, muñeca rota y distancia entre dos manos escala.
- **Hologramas:** selecciona una figura en el panel; los mismos movimientos la manipulan. Cada inicio de pellizco produce un giro discreto de 45° (con enfriamiento).
- **Dibujo:** une índice y pulgar para trazar con el índice. Suelta para separar trazos. Configura color y grosor; reinicia para borrar. Se limita a 1800 segmentos para acotar memoria. PNG guarda gráficos transparentes, sin video.
- **Energía:** vórtice, ondas y anillos responden a velocidad y dirección de la palma. No incluye un simulador físico.
- **Ratón:** demostración explícita, sin detección simulada. Mueve para trasladar y mantén pulsado para dibujar.
- Usa los botones de vista para ocultar la cámara o controles, mostrar puntos, reiniciar, exportar y entrar en pantalla completa. La guía explica los gestos.

## Arquitectura y decisiones

- `tracking/useCamera.ts`: permisos, stream, carga local de MediaPipe, detección VIDEO hasta 20 Hz, limpieza y errores. Inferencia en un Web Worker independiente, con GPU y alternativa CPU si la inicialización GPU falla. Solo se transfiere un fotograma pendiente; la frecuencia se adapta a la duración de inferencia, sin acumular imágenes.
- `tracking/gestures.ts`: estados por mano, medidas normalizadas según palma y relación de aspecto, suavizado temporal, histéresis de pellizco, eventos de inicio y expiración de historial.
- `scene/shapes.ts`: posiciones precomputadas para BufferGeometry.
- `scene/engine.ts`: renderizador transparente, cámara virtual, partículas, objetos, trazos y energía; un único requestAnimationFrame. Materiales y geometrías persistentes; los trazos se agrupan en un InstancedMesh de hasta 1800 segmentos, con una sola llamada de dibujo.
- `App.tsx`: controles y estado. Preferencias de color, calidad y espejo restauradas desde localStorage.

El video utiliza `object-fit: contain`; el proyector aplica el mismo ajuste y espejo. La profundidad es virtual/estimada, **no una medición física** a partir de RGB. El dibujo se fija al plano virtual para evitar saltos de profundidad.

Calidades: 1000/5000/15000 partículas máximas, moduladas por intensidad. Después de cuatro segundos sostenidos por debajo de 27 FPS se reduce un perfil y el pixel ratio. El perfil bajo limita anillos. No se garantizan FPS: inferencia y WebGL comparten los recursos del dispositivo. Cambia manualmente la calidad para volver a aumentar el límite.

Se liberan stream, detector, RAF, ResizeObserver, geometrías y materiales al desmontar. Los fallos recuperables muestran mensajes. No se implementa grabación de video ni transmisión de imágenes. El PNG exporta únicamente los gráficos, incluso si la cámara es visible.

## Validación manual con cámara

1. Probar permiso aceptado y denegado, cámara ocupada y desconexión.
2. Verificar los 21 puntos de cada una de dos manos, espejo activado/desactivado y ventanas vertical/horizontal.
3. Probar apertura, puño, pellizco sostenido, liberación, movimiento, rotación y escala de dos manos.
4. Cambiar los cuatro modos, dibujar trazos separados y descargar PNG.
5. Desactivar cámara, reactivar, ocultar controles, pantalla completa y comprobar liberación del indicador de cámara al salir.
6. Medir FPS en hardware integrado en los tres perfiles; comprobar reducción adaptativa.

Las pruebas automatizadas usan landmarks sintéticos para verificar matemáticas y estados; no sustituyen la validación de la inferencia con una cámara física.

## Estado de verificación en este entorno

Verificado el 16 de noviembre de 2026:

- `npm ci --cache /tmp/holomotion-npm`: instalación reproducible y descarga del modelo oficial completadas.
- `npm run build`: recursos de visión presentes, TypeScript y compilación de producción correctos.
- `npm test`: cinco pruebas aprobadas de gestos, proyección y figuras.
- Chromium con WebGL software: cuatro modos, ratón, guía, exportación PNG, controles inmersivos y vista móvil sin desbordamiento; sin excepciones de JavaScript.
- MediaPipe ejecutado realmente en Chromium sobre una cámara de prueba alimentada con la imagen oficial `https://storage.googleapis.com/mediapipe-assets/right_hands.jpg`: **dos manos detectadas**, sin sustituir ni simular los resultados del detector.
- Cambio entre los cuatro modos con seguimiento activo, desactivación/reactivación del detector y comprobación de que los tracks de cámara terminan correctamente.

El bloqueo de descarga anterior quedó resuelto con la configuración publicada. La cámara usada en la prueba automatizada es virtual y contiene una imagen estática: **no sustituye la validación de gestos dinámicos con una webcam física ni mediciones de rendimiento en gráficos integrados**. La checklist manual anterior sigue siendo aplicable.

`npm run build` comprueba primero que el modelo y WASM estén presentes; falla expresamente mientras falten. `npm run build:ui` permite comprobar solo el código y no constituye una distribución completa. `npm run setup:assets` reintenta la descarga oficial, valida la estructura del paquete y guarda el modelo mediante un reemplazo atómico. Los recursos se sirven localmente al ejecutar la aplicación.

No se implementa grabación de video. La exportación PNG incluye los gráficos, sin la cámara. Vite avisa del tamaño del paquete principal de Three.js y MediaPipe; es un aviso de optimización, no un error de compilación.

## Web pública con GitHub Pages

El workflow `.github/workflows/pages.yml` instala, prueba, compila y despliega `dist/` cuando se actualiza `main`. Incluye el modelo y WASM, por lo que el navegador no necesita descargarlos de terceros.

Activación inicial por el propietario del repositorio:

1. Abre **Settings → Pages → Build and deployment → Source** y selecciona **GitHub Actions**.
2. En **Actions → Deploy HoloMotion to GitHub Pages**, ejecuta **Run workflow** sobre `main` (o vuelve a ejecutar el despliegue si falló antes de activar Pages).
3. Al terminar correctamente, la dirección prevista es `https://yudmernp-cmd.github.io/HOLOG3D/`. El enlace publicado también aparece en el entorno `github-pages` del workflow.

La cámara necesita HTTPS y permiso del navegador. Subir el workflow no confirma que Pages esté activado ni que el despliegue haya terminado.

### Corrección de fluidez

El seguimiento ya no bloquea el hilo de la interfaz: `public/hand-worker.js` ejecuta MediaPipe con GPU cuando está disponible y CPU como alternativa. El bitmap se transfiere al worker, se cierra tras inferir y nunca se acumulan solicitudes. El seguimiento se pausa en pestañas ocultas. Terminar la cámara también termina el worker.

El renderizador solicita gráficos de alto rendimiento, omite actualizaciones de partículas ocultas y reutiliza los segmentos de dibujo mediante instancias. La captura PNG renderiza solo al exportar, sin conservar el framebuffer en cada fotograma. No se garantiza una frecuencia concreta: depende del navegador, aceleración gráfica, energía y resolución.

Verificación de la corrección: comparación de ocho segundos en Chromium con cámara virtual de dos manos, misma ventana (1280×900) y gráficos SwiftShader. Antes: 11 FPS, p95 entre fotogramas 117 ms, 87 tareas largas y 7844 ms acumulados en ellas. Después: 32 FPS, p95 50 ms, una tarea larga de 50 ms. No son resultados de una RTX 3050 ni garantías para otros equipos.

Regresión de dibujo reproducible: con `npm run dev` activo, ejecuta `npx playwright install chromium` y `npm run test:browser`. Opcionalmente usa `CHROMIUM_PATH=/usr/bin/chromium` para un navegador instalado y `TEST_URL` para otro servidor de desarrollo. Comprueba 1800 segmentos con una llamada de dibujo, borrado y descarga PNG. La prueba del detector también volvió a detectar dos manos y verificó reinicio y cierre de tracks sin excepciones.
