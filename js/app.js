$(function () {
  const API_URL = 'api/libros.php';
  let librosCache = [];
  let timerBusqueda;
  let notificationTimer;

  function escaparHtml(value) {
    return $('<div>').text(value == null ? '' : String(value)).html();
  }

  function notificar(message, isError) {
    const element = $('#notificacion');
    element.text(message).toggleClass('error', Boolean(isError)).addClass('visible');
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => element.removeClass('visible'), 3000);
  }

  function obtenerParametros() {
    return {
      q: $('#busqueda').val().trim(),
      categoria: $('#filtroCategoria').val(),
      disponible: $('#filtroDisponible').val(),
      orden: $('#filtroOrden').val()
    };
  }

  function cargarLibros() {
    $('#contadorResultados').text('Cargando catálogo...');
    $.ajax({ url: API_URL, method: 'GET', data: obtenerParametros(), dataType: 'json' })
      .done(function (response) {
        if (!response.ok) throw new Error(response.error || 'No se pudo cargar el catálogo.');
        librosCache = response.data;
        poblarCategorias(response.categorias);
        renderizarCatalogo(response.data);
        $('#contadorResultados').text(`Mostrando ${response.total} libro(s)`);
      })
      .fail(function (xhr) {
        const message = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'Error al consultar el catálogo.';
        $('#contadorResultados').text(message);
        notificar(message, true);
      });
  }

  function poblarCategorias(categories) {
    const select = $('#filtroCategoria');
    const current = select.val();
    select.find('option:not(:first)').remove();
    categories.forEach(function (category) {
      $('<option>').val(category).text(category).appendTo(select);
    });
    if (categories.includes(current)) select.val(current);
  }

  function renderizarCatalogo(books) {
    const grid = $('#catalogoGrid').empty();
    if (!books.length) {
      grid.html('<div class="empty-state">No se encontraron libros con los filtros aplicados.</div>');
      return;
    }
    books.forEach(function (book) {
      const available = Number(book.disponible) === 1;
      grid.append(`
        <article class="book-card">
          <div>
            <div class="book-header">
              <span class="book-cat">${escaparHtml(book.categoria)}</span>
              <span class="badge ${available ? 'ok' : 'off'}">${available ? 'Disponible' : 'Prestado'}</span>
            </div>
            <h2 class="book-title">${escaparHtml(book.titulo)}</h2>
            <p class="book-author">${escaparHtml(book.autor)} (${escaparHtml(book.anio_publicacion)})</p>
            <p class="book-meta">Editorial: ${escaparHtml(book.editorial)} · ISBN: ${escaparHtml(book.isbn)}</p>
          </div>
          <div class="book-actions">
            <button class="btn btn-secondary btn-sm btn-detalle" type="button" data-id="${book.id}">Sinopsis</button>
            <button class="btn btn-primary btn-sm btn-toggle" type="button" data-id="${book.id}">${available ? 'Marcar prestado' : 'Marcar disponible'}</button>
            <button class="btn btn-danger btn-sm btn-eliminar" type="button" data-id="${book.id}">Eliminar</button>
          </div>
        </article>`);
    });
  }

  function cerrarModales() { $('.modal').addClass('hidden'); }

  $('#busqueda').on('input', function () {
    clearTimeout(timerBusqueda);
    timerBusqueda = setTimeout(cargarLibros, 300);
  });
  $('#filtroCategoria, #filtroDisponible, #filtroOrden').on('change', cargarLibros);
  $('#btnAbrirModal').on('click', function () { $('#modalLibro').removeClass('hidden'); $('input[name="titulo"]').trigger('focus'); });
  $('[data-close]').on('click', function () { $('#' + $(this).data('close')).addClass('hidden'); });
  $('.modal').on('click', function (event) { if (event.target === this) $(this).addClass('hidden'); });
  $(document).on('keydown', function (event) { if (event.key === 'Escape') cerrarModales(); });

  $('#formLibro').on('submit', function (event) {
    event.preventDefault();
    const data = {};
    $(this).serializeArray().forEach(item => { data[item.name] = item.value; });
    $.ajax({ url: API_URL, method: 'POST', contentType: 'application/json', data: JSON.stringify(data), dataType: 'json' })
      .done(function (response) {
        $('#formLibro')[0].reset();
        $('#modalLibro').addClass('hidden');
        notificar(response.mensaje || 'Libro registrado.');
        cargarLibros();
      })
      .fail(function (xhr) {
        const message = xhr.responseJSON && xhr.responseJSON.error ? xhr.responseJSON.error : 'No se pudo guardar el libro.';
        notificar(message, true);
      });
  });

  $(document).on('click', '.btn-detalle', function () {
    const book = librosCache.find(item => Number(item.id) === Number($(this).data('id')));
    if (!book) return;
    $('#detalleTitulo').text(book.titulo);
    $('#detalleMeta').text(`${book.autor} · ${book.editorial} (${book.anio_publicacion}) · ${book.paginas} págs.`);
    $('#detalleSinopsis').text(book.sinopsis);
    $('#modalDetalle').removeClass('hidden');
  });

  $(document).on('click', '.btn-toggle', function () {
    const button = $(this);
    button.prop('disabled', true);
    $.ajax({ url: API_URL, method: 'PUT', contentType: 'application/json', data: JSON.stringify({ id: Number(button.data('id')) }), dataType: 'json' })
      .done(function (response) { notificar(response.mensaje); cargarLibros(); })
      .fail(function (xhr) { notificar((xhr.responseJSON && xhr.responseJSON.error) || 'No se pudo actualizar el estado.', true); })
      .always(function () { button.prop('disabled', false); });
  });

  $(document).on('click', '.btn-eliminar', function () {
    const id = Number($(this).data('id'));
    if (!window.confirm('¿Desea eliminar este libro del catálogo?')) return;
    $.ajax({ url: `${API_URL}?id=${id}`, method: 'DELETE', dataType: 'json' })
      .done(function (response) { notificar(response.mensaje); cargarLibros(); })
      .fail(function (xhr) { notificar((xhr.responseJSON && xhr.responseJSON.error) || 'No se pudo eliminar el libro.', true); });
  });

  $('#btnExportar').on('click', function () {
    if (!librosCache.length) { notificar('No hay libros para exportar.', true); return; }
    const headers = ['Título', 'Autor', 'Categoría', 'Año', 'ISBN', 'Editorial', 'Páginas', 'Estado'];
    const rows = librosCache.map(book => [book.titulo, book.autor, book.categoria, book.anio_publicacion, book.isbn, book.editorial, book.paginas, Number(book.disponible) ? 'Disponible' : 'Prestado']);
    const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'catalogo-libros.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  cargarLibros();
});
