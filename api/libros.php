<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/conexion.php';

function responder(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function entradaJson(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return $_POST;
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function validarLibro(array $input): array
{
    $required = ['titulo', 'autor', 'categoria', 'anio_publicacion', 'isbn', 'editorial', 'sinopsis'];
    foreach ($required as $field) {
        if (!isset($input[$field]) || trim((string) $input[$field]) === '') {
            responder(['ok' => false, 'error' => "El campo '{$field}' es obligatorio."], 400);
        }
    }

    $year = filter_var($input['anio_publicacion'], FILTER_VALIDATE_INT);
    $pages = filter_var($input['paginas'] ?? 100, FILTER_VALIDATE_INT);
    if ($year === false || $year < 1500 || $year > ((int) date('Y') + 1)) {
        responder(['ok' => false, 'error' => 'El año de publicación no es válido.'], 400);
    }
    if ($pages === false || $pages < 1 || $pages > 10000) {
        responder(['ok' => false, 'error' => 'El número de páginas no es válido.'], 400);
    }

    return [
        'titulo' => trim((string) $input['titulo']),
        'autor' => trim((string) $input['autor']),
        'categoria' => trim((string) $input['categoria']),
        'anio' => $year,
        'isbn' => trim((string) $input['isbn']),
        'editorial' => trim((string) $input['editorial']),
        'paginas' => $pages,
        'sinopsis' => trim((string) $input['sinopsis']),
    ];
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        $search = trim((string) ($_GET['q'] ?? ''));
        $category = trim((string) ($_GET['categoria'] ?? ''));
        $available = (string) ($_GET['disponible'] ?? '');
        $order = (string) ($_GET['orden'] ?? 'recientes');
        $orderBy = [
            'recientes' => 'id DESC',
            'anio_desc' => 'anio_publicacion DESC, titulo ASC',
            'titulo_asc' => 'titulo ASC, id DESC',
        ][$order] ?? 'id DESC';

        $where = ['1 = 1'];
        $params = [];
        if ($search !== '') {
            $where[] = '(titulo LIKE :q OR autor LIKE :q OR isbn LIKE :q)';
            $params[':q'] = "%{$search}%";
        }
        if ($category !== '' && $category !== 'Todas') {
            $where[] = 'categoria = :categoria';
            $params[':categoria'] = $category;
        }
        if ($available === '0' || $available === '1') {
            $where[] = 'disponible = :disponible';
            $params[':disponible'] = (int) $available;
        }

        $stmt = $pdo->prepare(
            'SELECT * FROM libros WHERE ' . implode(' AND ', $where) . " ORDER BY {$orderBy}"
        );
        $stmt->execute($params);
        $books = $stmt->fetchAll();
        $categories = $pdo->query('SELECT DISTINCT categoria FROM libros ORDER BY categoria ASC')
            ->fetchAll(PDO::FETCH_COLUMN);
        responder(['ok' => true, 'total' => count($books), 'categorias' => $categories, 'data' => $books]);
    }

    $input = entradaJson();

    if ($method === 'POST') {
        $book = validarLibro($input);
        $duplicate = $pdo->prepare('SELECT id FROM libros WHERE isbn = :isbn LIMIT 1');
        $duplicate->execute([':isbn' => $book['isbn']]);
        if ($duplicate->fetchColumn() !== false) {
            responder(['ok' => false, 'error' => 'Ya existe un libro con ese ISBN.'], 409);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO libros
            (titulo, autor, categoria, anio_publicacion, isbn, editorial, paginas, sinopsis, disponible)
            VALUES (:titulo, :autor, :categoria, :anio, :isbn, :editorial, :paginas, :sinopsis, 1)'
        );
        $stmt->execute([
            ':titulo' => $book['titulo'],
            ':autor' => $book['autor'],
            ':categoria' => $book['categoria'],
            ':anio' => $book['anio'],
            ':isbn' => $book['isbn'],
            ':editorial' => $book['editorial'],
            ':paginas' => $book['paginas'],
            ':sinopsis' => $book['sinopsis'],
        ]);
        responder(['ok' => true, 'id' => $pdo->lastInsertId(), 'mensaje' => 'Libro registrado.'], 201);
    }

    $id = filter_var($input['id'] ?? $_GET['id'] ?? null, FILTER_VALIDATE_INT);
    if ($id === false || $id === null || $id < 1) {
        responder(['ok' => false, 'error' => 'ID inválido.'], 400);
    }

    if ($method === 'PUT') {
        $stmt = $pdo->prepare('UPDATE libros SET disponible = NOT disponible WHERE id = :id');
        $stmt->execute([':id' => $id]);
        if ($stmt->rowCount() === 0) {
            responder(['ok' => false, 'error' => 'Libro no encontrado.'], 404);
        }
        responder(['ok' => true, 'mensaje' => 'Disponibilidad actualizada.']);
    }

    if ($method === 'DELETE') {
        $stmt = $pdo->prepare('DELETE FROM libros WHERE id = :id');
        $stmt->execute([':id' => $id]);
        if ($stmt->rowCount() === 0) {
            responder(['ok' => false, 'error' => 'Libro no encontrado.'], 404);
        }
        responder(['ok' => true, 'mensaje' => 'Libro eliminado.']);
    }

    header('Allow: GET, POST, PUT, DELETE');
    responder(['ok' => false, 'error' => 'Método no permitido.'], 405);
} catch (PDOException $e) {
    if ((int) $e->errorInfo[1] === 1062) {
        responder(['ok' => false, 'error' => 'Ya existe un libro con ese ISBN.'], 409);
    }
    responder(['ok' => false, 'error' => 'Error en la base de datos.'], 500);
} catch (Throwable $e) {
    responder(['ok' => false, 'error' => 'Error interno del servidor.'], 500);
}
