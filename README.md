# HoloMotion 3D · contacto virtual

Laboratorio existente en React, TypeScript estricto, Vite, Three.js, Tailwind y MediaPipe Hand Landmarker. El holograma tiene posición, orientación y escala independientes. Aparece centrado y permanece quieto hasta que se agarra sobre su superficie proyectada. No sigue manos libres ni gira solo.

## Ejecutar

Node.js 22/24, npm y navegador con WebGL. La cámara requiere HTTPS o localhost.

```sh
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

La instalación copia el runtime WASM y descarga el modelo oficial desde `storage.googleapis.com`. Después se sirven desde el mismo origen: los fotogramas de webcam no se transmiten ni graban. `npm ci` permite instalaciones reproducibles. Si faltan recursos, ejecuta `npm run setup:assets`. `build` comprueba modelo y WASM; `build:ui` solo verifica código y no produce una distribución completa con visión.

## Manipulación

1. Activa la cámara, muestra la mano completa con buena luz y acerca el índice a una parte visible del holograma. El punto luminoso indica la zona próxima.
2. **Trasladar:** pellizca sobre la superficie, mantén el pellizco y arrastra. Se conserva el desplazamiento respecto al punto inicial; la figura no salta al dedo. Abre los dedos para soltarla.
3. **Rotar:** selecciona este control antes de agarrar; pellizca sobre la figura y arrastra. Un arcball virtual convierte el movimiento en un cuaternión 3D. Trasladar no incorpora movimientos de muñeca ni rotaciones accidentales.
4. **Escalar:** con una mano agarrada, pellizca otro punto de la superficie con la segunda mano. Separarlas amplía y acercarlas reduce. La escala usa `escalaInicial × distanciaActual / distanciaInicial`, con límites 0.3–2.5. El centro permanece fijo en Trasladar y Rotar.
5. **Combinar:** con dos agarres, el punto medio traslada, la separación escala y la orientación del vector entre manos gira en el plano de pantalla. Con una mano funciona como Trasladar. Para inclinaciones en los otros ejes usa Rotar.
6. Un pellizco iniciado fuera no selecciona aunque después entre en la figura: abre los dedos y pellizca de nuevo. El halo de proximidad no autoriza por sí solo el agarre. En un toroide, el agujero tampoco es superficie.

Sensibilidad ajusta el umbral de pellizco normalizado por el tamaño de la palma y la zona muerta del desplazamiento (2.5 píxeles a 1×). Comienza en 1×; aumenta si cuesta cerrar el agarre, reduce si aparece accidentalmente. El detector emplea umbrales diferentes de entrada/salida y confirmación temporal. Cambiar figura, modo, espejo, tamaño de ventana o herramienta termina el agarre: abre los dedos para volver a agarrar.

La posición final no se guarda entre recargas; Reiniciar centra la figura y borra trazos. Color, calidad y espejo se restauran desde localStorage.

## Funciones conservadas

- Partículas: figuras interpoladas, calidad e intensidad ajustables. El agarre usa intersecciones con puntos visibles (tolerancia de 4 unidades de pantalla), no una esfera invisible que rellene los huecos.
- Hologramas: geometría continua, iluminación sencilla, líneas y respuesta discreta al contacto. No se deforma al tocarla.
- Dibujo: pellizco en cualquier posición para dibujar con el índice, color y grosor configurables, hasta 1800 segmentos agrupados en una llamada de dibujo. Suelta para separar trazos.
- Energía: conserva el vórtice y los anillos animados; estos efectos siguen siendo cosméticos. La transformación global también requiere agarre. Las deformaciones de este modo no se aplican al holograma sólido.
- Ratón: demostración explícita. Pulsa **sobre** la figura para arrastrar o rotar según la herramienta. Mover el ratón libre no mueve el objeto. En Dibujo, mantén pulsado para trazar.
- Espejo, cámara visible/oculta, puntos de diagnóstico opcionales, pantalla completa, controles inmersivos, reinicio y PNG. PNG exporta solo gráficos transparentes, sin webcam.

## Arquitectura y precisión

- `src/interaction/controller.ts`: máquina IDLE → HOVER/CONTACT → GRABBING → TRANSFORMING → RELEASE. Almacena posición, cuaternión y escala. Cada cambio de número de agarres recalibra las referencias sin saltos. Usa zona muerta, interpolación temporal de transformaciones y límites de escala/centro visible.
- `src/interaction/contact.ts`: Raycaster sobre la geometría real del holograma, sin incluir sus líneas hijas. Cuatro rayos próximos sirven únicamente para hover. Las pruebas se ejecutan al recibir observaciones del detector, no en cada refresco de pantalla.
- `src/tracking/identity.ts`: asociación espacial global de hasta dos manos, con apoyo de handedness. Mantiene identidades ante cambios de orden y etiquetas duplicadas. Cruces u oclusiones prolongadas todavía pueden resultar ambiguos.
- `src/tracking/gestures.ts` y `smoothing.ts`: normalización por palma y aspecto, histéresis de pellizco, confirmación de cambios y filtro One Euro sobre los 21 landmarks.
- `src/tracking/useCamera.ts` y `public/hand-worker.js`: captura local, inferencia MediaPipe en un worker hasta 20 Hz con una imagen pendiente, GPU si está disponible y CPU como alternativa. No se acumulan frames.
- `src/scene/engine.ts`: Three.js, composición, formas, contactos, feedback, dibujo por instancias y calidad adaptativa. Geometrías/materiales se crean al iniciar o cambiar figura, no cada frame.
- `src/App.tsx`, `src/types.ts` y `src/style.css`: selector contextual, instrucciones, estado y configuración; se conserva la estructura visual existente.

La frescura se mide desde la recepción del resultado: una inferencia lenta recién recibida ya no se descarta por superar 250 ms desde la captura. Tras 500 ms sin resultados nuevos, se considera perdido el seguimiento. Al desaparecer una mano agarrada, se congela la transformación durante hasta 500 ms. Si vuelve, se recalibran las referencias a la transformación conservada; si no vuelve, se libera. No se extrapola velocidad ni se lanza el holograma. Un pellizco mantenido no vuelve a seleccionar automáticamente la misma identidad tras liberar por pérdida.

## Composición y límites

Video y landmarks usan el mismo ajuste `object-fit: contain`, resolución, relación de aspecto y espejo. El espejo se aplica exactamente una vez a cada capa. Los puntos de diagnóstico se dibujan en el plano de pantalla para no introducir errores de perspectiva.

**Contacto virtual no equivale a contacto físico 3D.** El Raycaster comprueba coincidencia proyectada con la superficie y el pellizco confirma intención. No se usa la profundidad relativa ruidosa de MediaPipe como distancia métrica. El arrastre trabaja en un plano virtual, y el arcball produce orientación 3D; no existe anclaje a la habitación.

**No hay segmentación ni oclusión física de manos.** La figura conserva su superficie, orden de profundidad y volumen; se compone delante del video. No puede quedar correctamente detrás de los dedos según su distancia real. El material parcialmente transparente ayuda a ver las manos, pero no resuelve esa limitación. No se presenta una máscara aproximada como profundidad medida.

Calidades: 1000/5000/15000 partículas máximas, moduladas por intensidad. Cuatro segundos por debajo de 27 FPS reducen calidad y pixel ratio; el perfil bajo reduce anillos. No se garantizan FPS en hardware integrado. Se liberan stream, worker, RAF, observers, geometrías y materiales al desmontar. Los errores recuperables se muestran en pantalla.

## Pruebas

```sh
npm test
npm run typecheck
npm run build
# Con npm run dev activo y Chromium instalado:
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser:contact
```

También puedes instalar Chromium con `npx playwright install chromium` y omitir `CHROMIUM_PATH`. `TEST_URL` permite usar otro puerto del servidor Vite.

Las pruebas unitarias cubren manos libres, pellizco fuera, entrada ya pellizcada, agarre válido, desplazamiento relativo, conservación al soltar, zona muerta, arcball normalizado, escala relativa y sus límites, distancia inicial degenerada, segundo agarre inválido, cambios de número de manos, transformación combinada, pérdida y recuperación, cambios de contexto, identidad, filtros y proyección. El contacto geométrico verifica que el agujero de un toroide no selecciona y que hover no equivale a contacto.

Las pruebas Chromium usan el motor real y landmarks sintéticos para agarre/arrastre/rotación; verifican también 1800 segmentos en una llamada de dibujo, borrado y PNG. No son pruebas de gestos humanos con webcam.

Verificación del 17 de noviembre de 2026: 34 pruebas unitarias aprobadas, compilación completa con TypeScript y assets correcta; pruebas Chromium de contacto, arrastre, rotación, conservación al soltar, dibujo y PNG aprobadas. MediaPipe detectó realmente dos manos sobre una cámara virtual alimentada con una imagen oficial estática; se verificaron los cuatro modos, reinicio del detector y cierre de tracks sin excepciones. No se probaron gestos dinámicos con webcam física ni rendimiento en la laptop del usuario. Vite conserva un aviso de tamaño del paquete principal, sin errores de compilación.

### Checklist con cámara física pendiente

1. Mueve ambas manos sin pellizcar: el holograma debe permanecer inmóvil. Pellizca fuera: tampoco debe moverse.
2. Lleva el índice sobre la superficie, pellizca y arrastra unos centímetros hacia cada lado. No debe saltar al seleccionar; al abrir los dedos debe quedarse allí.
3. Elige Rotar, agarra y arrastra horizontal/vertical/diagonalmente. Comprueba orientación continua y que no traslada. Suelta y verifica que conserva el giro.
4. En Trasladar, agarra dos puntos separados. Separa y acerca ambas manos: aumenta y disminuye progresivamente sin desplazar el centro. Suelta primero una mano, luego la otra: sin saltos.
5. En Combinar, desplaza el punto medio y cambia la dirección entre ambas manos; verifica que combina traslación, tamaño y giro.
6. Mantén la mano quieta con un temblor leve. Ocúltala brevemente y vuelve a mostrarla en otra posición: la figura debe congelarse y recuperar sin salto. Tras una pérdida prolongada, abre los dedos antes de volver a agarrar.
7. Comprueba alineación de los puntos de diagnóstico con ambas orientaciones de espejo y ventanas vertical/horizontal. El video debe mostrar tus manos reales.
8. Prueba permiso denegado, cámara ocupada, desconexión, reinicio del detector y liberación del indicador de cámara al salir.
9. Revisa los cuatro modos, dibujo, exportación, pantalla completa y perfil Bajo. Mide FPS en tu laptop durante varios minutos; no hay medición de ese hardware en este entorno.

## Publicación

El workflow `.github/workflows/pages.yml` prueba, compila y despliega `dist/` al actualizar `main`. Incluye modelo y WASM. En GitHub, Settings → Pages → Source debe usar GitHub Actions. Dirección prevista: https://yudmernp-cmd.github.io/HOLOG3D/ . Un push no confirma por sí solo que el despliegue haya terminado; comprueba el workflow verde.

### Ajuste V 2.1 AGARRE

El holograma mantiene una opacidad de 0.12 en reposo, 0.17 al aproximarse y 0.22 durante el agarre. El contacto real previo se recuerda durante 250 ms para cerrar el pellizco: se permite un desplazamiento del índice de hasta 24 px si sigue dentro del halo próximo a la geometría. Acercarse sin haber tocado no arma un agarre. La pantalla indica inmediatamente «Contacto: une índice y pulgar» y «AGARRADO»; tocar sin pellizcar solo prepara la selección. Pruebas nuevas cubren cierre del pellizco cerca del borde, rechazo de contacto expirado/lejos, inferencia lenta recién recibida y transparencia durante el agarre.

### Ajuste V 2.2 ESCALA

- Identidades retenidas durante 750 ms; agarres congelados durante hasta 500 ms de ausencia, con recalibración al recuperar la mano para evitar saltos. No se inventan landmarks para una mano oculta.
- Con dos agarres, una clasificación ambigua de apertura durante menos de 120 ms no cancela la escala. Una palma claramente abierta libera inmediatamente. La interfaz diferencia 1/2 y 2/2 agarres y muestra una pausa al perder seguimiento.
- Escala con zona muerta sobre la distancia aceptada, conservando el tamaño al temblar. Si los agarres comienzan demasiado juntos, la referencia se establece cuando se separan al menos 24 px, en vez de quedar bloqueada.
- Umbrales de MediaPipe ajustados de 0.55 a 0.50, manteniendo dos manos y la confirmación temporal del gesto. Esto no garantiza detección ante oclusión, mala luz o manos fuera del encuadre.
- Sin raycasts para manos que ya sujetan el objeto; sin proyección de esqueletos ocultos; sin actualizaciones/subidas del buffer de partículas tras estabilizar una transición. Pixel ratio limitado a 1 en Bajo y 1.25 en otros perfiles, conservando reducción automática por FPS bajos.

Para probar escala: agarra un punto con cada mano y comprueba **2/2 agarres**. Mantén ambas manos completas, visibles y separadas entre sí; separa/acerca gradualmente. **Dos manos detectadas no equivale a dos agarres**: cada mano debe pellizcar sobre una zona válida. Si indica pausa, mantén el pellizco y vuelve a mostrar la mano. Tras una pérdida prolongada, vuelve a agarrar.

Las nuevas regresiones comprueban oclusión de 400 ms, recuperación de identidad, pellizco ambiguo, inicio con agarres demasiado juntos y estabilidad de escala. La prueba de navegador comprueba cero subidas redundantes del buffer de partículas una vez estabilizado y pixel ratio 1 en calidad Baja. No hay mediciones de FPS en la laptop del usuario.
