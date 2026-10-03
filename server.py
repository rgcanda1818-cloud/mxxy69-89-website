from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from threading import BoundedSemaphore
from datetime import date, datetime, timezone
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
DATABASE_DIR = Path(os.environ.get("NORTHGATE_DATA_DIR", str(Path.home() / ".northgate"))).expanduser().resolve()
DATABASE = DATABASE_DIR / "northgate.sqlite3"
LEGACY_DATABASE = ROOT / "northgate.sqlite3"
try:
    DATABASE.relative_to(ROOT)
except ValueError:
    pass
else:
    raise RuntimeError("NORTHGATE_DATA_DIR must be outside the website directory.")
HOST = os.environ.get("NORTHGATE_HOST", "127.0.0.1")
PORT = int(os.environ.get("NORTHGATE_PORT", os.environ.get("PORT", "8080")))
MAX_CONCURRENT_REQUESTS = max(8, int(os.environ.get("NORTHGATE_MAX_CONCURRENT_REQUESTS", "64")))
SESSION_COOKIE = "northgate_session"
SESSION_SECONDS = 60 * 60 * 24 * 14
PASSWORD_ITERATIONS = 310_000
MAX_BODY_BYTES = 2_000_000
SHIPPING_CENTS = 1299
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ORDER_STATUS_TRANSITIONS = {
    "Processing": {"Shipped", "Cancelled"},
    "Shipped": {"Delivered"},
    "Delivered": set(),
    "Cancelled": set(),
}


class AdminRequiredError(Exception):
    pass


try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None
    dict_row = None
    DATABASE_INTEGRITY_ERRORS = (sqlite3.IntegrityError,)
else:
    DATABASE_INTEGRITY_ERRORS = (sqlite3.IntegrityError, psycopg.IntegrityError)


PRODUCTS = {
    product_id: (name, image, price_cents)
    for product_id, name, image, price_cents in [
        ("wireless-earbuds-pro", "Wireless Earbuds Pro", "photo-1546868871-7041f2a55e12", 7999),
        ("smartwatch-max", "SmartWatch Max", "photo-1523275335684-37898b6baf30", 14900),
        ("modern-laptop-air-13", "Modern Laptop Air 13", "photo-1583394838336-acd977736f90", 89999),
        ("desk-air-purifier", "Desk Air Purifier", "photo-1521572267360-ee0c2909d518", 6499),
        ("studio-wireless-headphones", "Studio Wireless Headphones", "photo-1505740420928-5e560c06d30e", 8999),
        ("compact-air-fryer", "Compact Air Fryer", "photo-1556911220-bff31c812dba", 5999),
        ("weekender-travel-bag", "Weekender Travel Bag", "photo-1548036328-c9fa89d128fa", 4799),
        ("smart-desk-lamp-pro", "Smart Desk Lamp Pro", "photo-1507473885765-e6ed057f782c", 3999),
        ("daily-hydration-serum-set", "Daily Hydration Serum Set", "photo-1608248543803-ba4f8c70ae0b", 2799),
        ("adjustable-dumbbell-set", "Adjustable Dumbbell Set", "photo-1517836357463-d25dfeac3438", 6999),
        ("portable-bluetooth-speaker", "Portable Bluetooth Speaker", "photo-1608043152269-423dbba4e7e1", 4299),
        ("artisan-pour-over-kit", "Artisan Pour-Over Kit", "photo-1495474472287-4d71bcdd2085", 2899),
        ("pocket-instant-camera", "Pocket Instant Camera", "photo-1516035069371-29a1b244cc32", 8999),
        ("commuter-rolltop-backpack", "Commuter Rolltop Backpack", "photo-1553062407-98eeb64c6a62", 7200),
        ("ceramic-planter-trio", "Ceramic Planter Trio", "photo-1485955900006-10f4d324d411", 3450),
        ("performance-yoga-mat", "Performance Yoga Mat", "photo-1599447421416-3414500d18a5", 3900),
        ("hardcover-daily-journal", "Hardcover Daily Journal", "photo-1494438639946-1ebd1d20bf85", 1800),
        ("relaxed-linen-shirt", "Relaxed Linen Shirt", "photo-1490481651871-ab68de25d43d", 4999),
        ("glass-meal-prep-set", "Glass Meal Prep Set", "photo-1546069901-ba9599a7e63c", 3299),
        ("botanical-hand-cream-trio", "Botanical Hand Cream Trio", "photo-1608571423902-eed4a5ad8108", 2100),
        ("wireless-folding-keyboard", "Wireless Folding Keyboard", "photo-1516321318423-f06f85e504b3", 4495),
        ("sculptural-ceramic-vase", "Sculptural Ceramic Vase", "photo-1578749556568-bc2c40e68b61", 2850),
        ("linen-cushion-set", "Linen Cushion Set", "photo-1584100936595-c0654b55a2e2", 3299),
        ("ceramic-table-lamp", "Ceramic Table Lamp", "photo-1507473885765-e6ed057f782c", 4800),
        ("wireless-noise-canceling-headphones", "Wireless Noise-Canceling Headphones", "photo-1505740420928-5e560c06d30e", 12999),
        ("compact-bluetooth-speaker", "Compact Bluetooth Speaker", "photo-1608043152269-423dbba4e7e1", 5450),
        ("everyday-canvas-sneakers", "Everyday Canvas Sneakers", "photo-1542291026-7eec264c27ff", 6800),
        ("classic-crossbody-bag", "Classic Crossbody Bag", "photo-1548036328-c9fa89d128fa", 4295),
        ("hydrating-face-serum", "Hydrating Face Serum", "photo-1608248543803-ba4f8c70ae0b", 2400),
        ("daily-glow-skin-set", "Daily Glow Skin Set", "photo-1556229010-6c3f2c9ca5f8", 3850),
        ("pour-over-coffee-set", "Pour-Over Coffee Set", "photo-1495474472287-4d71bcdd2085", 3699),
        ("stainless-steel-cookware", "Stainless Steel Cookware", "photo-1556911220-bff31c812dba", 8900),
        ("adjustable-desk-organizer", "Adjustable Desk Organizer", "photo-1498050108023-c5249f4df085", 2999),
        ("ergonomic-wireless-mouse", "Ergonomic Wireless Mouse", "photo-1527864550417-7fd91fc51a46", 3995),
        ("insulated-steel-water-bottle", "Insulated Steel Water Bottle", "photo-1602143407151-7111542de6e8", 2200),
        ("resistance-band-training-set", "Resistance Band Training Set", "photo-1517836357463-d25dfeac3438", 2750),
    ]
}


class DatabaseConnection:
    def __init__(self, connection, postgres: bool):
        self.connection = connection
        self.postgres = postgres

    def __enter__(self):
        self.connection.__enter__()
        return self

    def __exit__(self, exception_type, exception, traceback):
        return self.connection.__exit__(exception_type, exception, traceback)

    def execute(self, statement: str, parameters=()):
        if not self.postgres:
            return self.connection.execute(statement, parameters)

        statement = self._postgres_statement(statement)
        return self.connection.execute(statement.replace("?", "%s"), parameters)

    def executemany(self, statement: str, parameter_rows):
        if not self.postgres:
            return self.connection.executemany(statement, parameter_rows)
        statement = self._postgres_statement(statement)
        return self.connection.executemany(statement.replace("?", "%s"), parameter_rows)

    @staticmethod
    def _postgres_statement(statement: str) -> str:
        if re.match(r"^\s*PRAGMA\b", statement, re.IGNORECASE):
            return ""
        statement = re.sub(
            r"\bemail\s*=\s*\?",
            "LOWER(email) = LOWER(?)",
            statement,
            flags=re.IGNORECASE,
        )
        statement = re.sub(r"\s+COLLATE\s+NOCASE\b", "", statement, flags=re.IGNORECASE)
        ignored_conflicts = bool(re.match(r"\s*INSERT\s+OR\s+IGNORE\s+INTO\b", statement, re.IGNORECASE))
        if ignored_conflicts:
            statement = re.sub(
                r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\b",
                "INSERT INTO",
                statement,
                flags=re.IGNORECASE,
            )
            statement = statement.rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
        statement = re.sub(r"\bINTEGER\s+PRIMARY\s+KEY\b", "SERIAL PRIMARY KEY", statement, flags=re.IGNORECASE)
        return re.sub(r"\bBLOB\b", "BYTEA", statement, flags=re.IGNORECASE)

    def executescript(self, script: str) -> None:
        if not self.postgres:
            self.connection.executescript(script)
            return
        for statement in script.split(";"):
            if statement.strip():
                self.execute(statement)


def connect_db():
    if DATABASE_URL:
        if psycopg is None:
            raise RuntimeError("DATABASE_URL is set but psycopg is not installed. Install requirements.txt.")
        return DatabaseConnection(
            psycopg.connect(DATABASE_URL, connect_timeout=10, row_factory=dict_row),
            postgres=True,
        )

    connection = sqlite3.connect(DATABASE, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return DatabaseConnection(connection, postgres=False)


def migrate_legacy_database() -> None:
    legacy_files = (
        Path(f"{LEGACY_DATABASE}-wal"),
        Path(f"{LEGACY_DATABASE}-shm"),
        LEGACY_DATABASE,
    )
    if DATABASE.exists():
        if any(path.exists() for path in legacy_files):
            raise RuntimeError(
                f"Both private and website-folder databases exist. Keep the private database at {DATABASE} "
                "and move the legacy database files out of the website folder before restarting."
            )
        return
    if not LEGACY_DATABASE.exists():
        return

    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    temporary_database = DATABASE_DIR / f".northgate-migration-{os.getpid()}.sqlite3"
    try:
        source = sqlite3.connect(LEGACY_DATABASE, timeout=10)
        try:
            destination = sqlite3.connect(temporary_database, timeout=10)
            try:
                source.backup(destination)
            finally:
                destination.close()
        finally:
            source.close()
        os.replace(temporary_database, DATABASE)
    except Exception as error:
        if temporary_database.exists():
            temporary_database.unlink()
        raise RuntimeError(f"Could not safely migrate the existing Northgate database to {DATABASE}.") from error

    for path in legacy_files:
        if path.exists():
            try:
                path.unlink()
            except OSError as error:
                raise RuntimeError(f"Could not remove the migrated database file {path}.") from error


def initialize_database() -> None:
    if not DATABASE_URL:
        DATABASE_DIR.mkdir(parents=True, exist_ok=True)
        migrate_legacy_database()
    with connect_db() as connection:
        connection.executescript(
            """
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                email TEXT NOT NULL,
                username TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
                phone TEXT NOT NULL DEFAULT '',
                gender TEXT NOT NULL DEFAULT '',
                birth_day TEXT NOT NULL DEFAULT '',
                birth_month TEXT NOT NULL DEFAULT '',
                birth_year TEXT NOT NULL DEFAULT '',
                avatar_image TEXT NOT NULL DEFAULT '',
                password_salt BLOB NOT NULL,
                password_hash BLOB NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
            CREATE TABLE IF NOT EXISTS addresses (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                label TEXT NOT NULL DEFAULT 'Home',
                recipient TEXT NOT NULL,
                phone TEXT NOT NULL,
                street TEXT NOT NULL,
                city TEXT NOT NULL,
                postal_code TEXT NOT NULL,
                country TEXT NOT NULL DEFAULT 'Philippines',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS addresses_user_id ON addresses(user_id);
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                delivery_email TEXT NOT NULL,
                phone TEXT NOT NULL,
                street TEXT NOT NULL,
                city TEXT NOT NULL,
                postal_code TEXT NOT NULL,
                payment_method TEXT NOT NULL,
                subtotal_cents INTEGER NOT NULL,
                shipping_cents INTEGER NOT NULL,
                total_cents INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS orders_user_date ON orders(user_id, created_at DESC);
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY,
                order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                image TEXT NOT NULL,
                unit_price_cents INTEGER NOT NULL,
                quantity INTEGER NOT NULL
            );
            """
        )
        connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (LOWER(email))")
        if DATABASE_URL:
            user_columns = {
                row["column_name"]
                for row in connection.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
                )
            }
        else:
            user_columns = {row["name"] for row in connection.execute("PRAGMA table_info(users)")}
        if "role" not in user_columns:
            connection.execute(
                "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin'))"
            )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                image TEXT NOT NULL,
                price_cents INTEGER NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            )"""
        )
        connection.executemany(
            "INSERT OR IGNORE INTO products (id, name, image, price_cents) VALUES (?, ?, ?, ?)",
            [(product_id, name, image, price) for product_id, (name, image, price) in PRODUCTS.items()],
        )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def password_digest(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)


class NorthgateHandler(SimpleHTTPRequestHandler):
    server_version = "NorthgateLocal/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        elif urlsplit(self.path).path.endswith((".css", ".js")):
            self.send_header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def _send_json(self, payload: dict, status: int = 200, extra_headers: list[tuple[str, str]] | None = None) -> None:
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        for name, value in extra_headers or []:
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(encoded)

    def _read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid request length.") from error
        if length < 0 or length > MAX_BODY_BYTES:
            raise ValueError("Request is too large.")
        try:
            value = json.loads(self.rfile.read(length) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValueError("Request body must be valid JSON.") from error
        if not isinstance(value, dict):
            raise ValueError("Request body must be a JSON object.")
        return value

    def _send_error(self, message: str, status: int = 400) -> None:
        self._send_json({"error": message}, status)

    def _check_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        return urlsplit(origin).netloc.lower() == self.headers.get("Host", "").lower()

    def _session_token(self) -> str | None:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            return None
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else None

    def _current_user(self, connection: sqlite3.Connection) -> sqlite3.Row | None:
        token = self._session_token()
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        row = connection.execute(
            """SELECT users.* FROM sessions
               JOIN users ON users.id = sessions.user_id
               WHERE sessions.token_hash = ? AND sessions.expires_at > ?""",
            (token_hash, int(time.time())),
        ).fetchone()
        if row is None:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        return row

    def _require_user(self, connection: sqlite3.Connection) -> sqlite3.Row:
        user = self._current_user(connection)
        if user is None:
            raise PermissionError("Please sign in to continue.")
        return user

    def _require_admin(self, connection: sqlite3.Connection) -> sqlite3.Row:
        user = self._require_user(connection)
        if user["role"] != "admin":
            raise AdminRequiredError("Administrator access is required.")
        return user

    @staticmethod
    def _account_json(user: sqlite3.Row) -> dict:
        return {
            "id": user["id"],
            "email": user["email"],
            "displayName": user["username"],
            "username": user["username"],
            "name": user["full_name"],
            "phone": user["phone"],
            "gender": user["gender"],
            "dateOfBirth": {
                "day": user["birth_day"],
                "month": user["birth_month"],
                "year": user["birth_year"],
            },
            "avatarImage": user["avatar_image"],
            "createdAt": user["created_at"],
            "isAdmin": user["role"] == "admin",
        }

    def _new_session(self, connection: sqlite3.Connection, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (token_hash, user_id, int(time.time()) + SESSION_SECONDS),
        )
        return token

    def _cookie_header(self, token: str, max_age: int = SESSION_SECONDS) -> tuple[str, str]:
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""
        return (
            "Set-Cookie",
            f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{secure}",
        )

    def _clear_cookie_header(self) -> tuple[str, str]:
        return ("Set-Cookie", f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")

    def _address_json(self, row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "label": row["label"],
            "recipient": row["recipient"],
            "phone": row["phone"],
            "street": row["street"],
            "city": row["city"],
            "postalCode": row["postal_code"],
            "country": row["country"],
            "isDefault": bool(row["is_default"]),
        }

    def _order_json(self, connection: sqlite3.Connection, row: sqlite3.Row) -> dict:
        items = connection.execute(
            "SELECT product_id, product_name, image, unit_price_cents, quantity FROM order_items WHERE order_id = ? ORDER BY id",
            (row["id"],),
        ).fetchall()
        return {
            "id": row["id"],
            "createdAt": row["created_at"],
            "status": row["status"],
            "customerEmail": row["delivery_email"],
            "customerName": row["customer_name"],
            "phone": row["phone"],
            "address": {
                "street": row["street"],
                "city": row["city"],
                "postalCode": row["postal_code"],
            },
            "paymentMethod": row["payment_method"],
            "items": [
                {
                    "id": item["product_id"],
                    "name": item["product_name"],
                    "image": item["image"],
                    "price": item["unit_price_cents"] / 100,
                    "quantity": item["quantity"],
                }
                for item in items
            ],
            "subtotal": row["subtotal_cents"] / 100,
            "shipping": row["shipping_cents"] / 100,
            "total": row["total_cents"] / 100,
        }

    def _handle_api_get(self, path: str) -> bool:
        with connect_db() as connection:
            if path == "/api/health":
                connection.execute("SELECT 1")
                self._send_json({"ok": True})
                return True
            if path == "/api/session":
                user = self._current_user(connection)
                self._send_json({"account": self._account_json(user) if user else None})
                return True
            if path == "/api/admin/orders":
                self._require_admin(connection)
                rows = connection.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall()
                self._send_json({"orders": [self._order_json(connection, row) for row in rows]})
                return True
            if path == "/api/addresses":
                user = self._require_user(connection)
                rows = connection.execute(
                    "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC",
                    (user["id"],),
                ).fetchall()
                self._send_json({"addresses": [self._address_json(row) for row in rows]})
                return True
            if path == "/api/orders":
                user = self._require_user(connection)
                rows = connection.execute(
                    "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
                    (user["id"],),
                ).fetchall()
                self._send_json({"orders": [self._order_json(connection, row) for row in rows]})
                return True
        return False

    def _handle_api_post(self, path: str, data: dict) -> bool:
        if not self._check_origin():
            self._send_error("Cross-site request rejected.", 403)
            return True

        if path in ("/api/register", "/api/login"):
            email = str(data.get("email", "")).strip().lower()
            password = str(data.get("password", ""))
            if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254:
                self._send_error("Enter a valid email address.")
                return True
            if len(password) < 8 or len(password) > 128:
                self._send_error("Password must be between 8 and 128 characters.")
                return True

            with connect_db() as connection:
                if path == "/api/register":
                    name = str(data.get("name", "")).strip()
                    if not name or len(name) > 80:
                        self._send_error("Enter a name no longer than 80 characters.")
                        return True
                    salt = secrets.token_bytes(16)
                    try:
                        cursor = connection.execute(
                            """INSERT INTO users (email, username, full_name, password_salt, password_hash, created_at)
                               VALUES (?, ?, ?, ?, ?, ?) RETURNING id""",
                            (email, name, name, salt, password_digest(password, salt), now_iso()),
                        )
                    except DATABASE_INTEGRITY_ERRORS:
                        self._send_error("An account with that email already exists. Sign in instead.", 409)
                        return True
                    user = connection.execute("SELECT * FROM users WHERE id = ?", (cursor.fetchone()["id"],)).fetchone()
                else:
                    user = connection.execute("SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email,)).fetchone()
                    if user is None or not hmac.compare_digest(
                        password_digest(password, user["password_salt"]), user["password_hash"]
                    ):
                        self._send_error("Email or password is incorrect.", 401)
                        return True
                token = self._new_session(connection, user["id"])
            self._send_json({"account": self._account_json(user)}, 200, [self._cookie_header(token)])
            return True

        if path == "/api/logout":
            token = self._session_token()
            if token:
                token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
                with connect_db() as connection:
                    connection.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
            self._send_json({"ok": True}, 200, [self._clear_cookie_header()])
            return True

        if path == "/api/addresses":
            try:
                with connect_db() as connection:
                    user = self._require_user(connection)
                    address_id = data.get("id")
                    values = (
                        str(data.get("label", "Home")).strip()[:40] or "Home",
                        str(data.get("recipient", "")).strip()[:80],
                        str(data.get("phone", "")).strip()[:40],
                        str(data.get("street", "")).strip()[:200],
                        str(data.get("city", "")).strip()[:100],
                        str(data.get("postalCode", "")).strip()[:20],
                        str(data.get("country", "Philippines")).strip()[:80] or "Philippines",
                        int(bool(data.get("isDefault", True))),
                    )
                    if not all(values[index] for index in (1, 2, 3, 4, 5)):
                        self._send_error("Fill in recipient, phone, street, city, and postal code.")
                        return True
                    if values[7]:
                        connection.execute("UPDATE addresses SET is_default = 0 WHERE user_id = ?", (user["id"],))
                    if address_id:
                        connection.execute(
                            """UPDATE addresses SET label=?, recipient=?, phone=?, street=?, city=?, postal_code=?, country=?, is_default=?
                               WHERE id=? AND user_id=?""",
                            (*values, int(address_id), user["id"]),
                        )
                    else:
                        connection.execute(
                            """INSERT INTO addresses (label, recipient, phone, street, city, postal_code, country, is_default, user_id, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (*values, user["id"], now_iso()),
                        )
                    rows = connection.execute(
                        "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC",
                        (user["id"],),
                    ).fetchall()
                self._send_json({"addresses": [self._address_json(row) for row in rows]})
            except PermissionError as error:
                self._send_error(str(error), 401)
            return True

        if path == "/api/orders":
            try:
                user = None
                with connect_db() as connection:
                    user = self._require_user(connection)
                    items = data.get("items")
                    if not isinstance(items, list) or not items or len(items) > 50:
                        self._send_error("Your cart is empty or contains too many items.")
                        return True
                    payment = str(data.get("paymentMethod", ""))
                    if payment not in ("cod", "transfer"):
                        self._send_error("Choose a valid demo payment method.")
                        return True
                    address = data.get("address") if isinstance(data.get("address"), dict) else {}
                    customer_name = str(data.get("customerName", "")).strip()[:80]
                    delivery_email = str(data.get("deliveryEmail", "")).strip().lower()[:254]
                    phone = str(data.get("phone", "")).strip()[:40]
                    street = str(address.get("street", "")).strip()[:200]
                    city = str(address.get("city", "")).strip()[:100]
                    postal_code = str(address.get("postalCode", "")).strip()[:20]
                    if not customer_name or not EMAIL_PATTERN.fullmatch(delivery_email) or not phone or not street or not city or not postal_code:
                        self._send_error("Complete all contact and delivery fields before placing the order.")
                        return True

                    priced_items = []
                    subtotal_cents = 0
                    for submitted_item in items:
                        if not isinstance(submitted_item, dict):
                            self._send_error("An item in the cart is invalid.")
                            return True
                        product_id = str(submitted_item.get("id", ""))
                        try:
                            quantity = int(submitted_item.get("quantity", 0))
                        except (TypeError, ValueError):
                            quantity = 0
                        product = connection.execute(
                            "SELECT id, name, image, price_cents FROM products WHERE id = ? AND active = 1",
                            (product_id,),
                        ).fetchone()
                        if product is None or quantity < 1 or quantity > 99:
                            self._send_error("A cart item is unavailable or has an invalid quantity.")
                            return True
                        line_total = product["price_cents"] * quantity
                        subtotal_cents += line_total
                        priced_items.append((product, quantity))

                    shipping_cents = SHIPPING_CENTS if subtotal_cents else 0
                    order_id = f"NG-{secrets.token_hex(4).upper()}"
                    created_at = now_iso()
                    connection.execute(
                        """INSERT INTO orders (id, user_id, created_at, status, customer_name, delivery_email, phone, street, city, postal_code, payment_method, subtotal_cents, shipping_cents, total_cents)
                           VALUES (?, ?, ?, 'Processing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (order_id, user["id"], created_at, customer_name, delivery_email, phone, street, city, postal_code, payment, subtotal_cents, shipping_cents, subtotal_cents + shipping_cents),
                    )
                    connection.executemany(
                        """INSERT INTO order_items (order_id, product_id, product_name, image, unit_price_cents, quantity)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        [(order_id, product["id"], product["name"], product["image"], product["price_cents"], quantity) for product, quantity in priced_items],
                    )
                    address_row = connection.execute(
                        """SELECT id FROM addresses WHERE user_id=? AND street=? AND city=? AND postal_code=? AND recipient=? LIMIT 1""",
                        (user["id"], street, city, postal_code, customer_name),
                    ).fetchone()
                    connection.execute("UPDATE addresses SET is_default = 0 WHERE user_id = ?", (user["id"],))
                    if address_row:
                        connection.execute("UPDATE addresses SET phone=?, is_default=1 WHERE id=?", (phone, address_row["id"]))
                    else:
                        connection.execute(
                            """INSERT INTO addresses (user_id, label, recipient, phone, street, city, postal_code, country, is_default, created_at)
                               VALUES (?, 'Home', ?, ?, ?, ?, ?, ?, 1, ?)""",
                            (user["id"], customer_name, phone, street, city, postal_code, str(address.get("country", "Philippines"))[:80], created_at),
                        )
                    order_row = connection.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
                    order_json = self._order_json(connection, order_row)
                self._send_json({"order": order_json}, 201)
            except PermissionError as error:
                self._send_error(str(error), 401)
            return True

        return False

    def _handle_api_put(self, path: str, data: dict) -> bool:
        if not self._check_origin():
            self._send_error("Cross-site request rejected.", 403)
            return True
        admin_order = re.fullmatch(r"/api/admin/orders/([^/]+)/status", path)
        if admin_order:
            order_id = unquote(admin_order.group(1))
            next_status = data.get("status")
            if not isinstance(next_status, str) or next_status not in ORDER_STATUS_TRANSITIONS:
                self._send_error("Choose a valid order status.")
                return True
            with connect_db() as connection:
                self._require_admin(connection)
                current = connection.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
                if current is None:
                    self._send_error("Order not found.", 404)
                    return True
                if next_status not in ORDER_STATUS_TRANSITIONS[current["status"]]:
                    self._send_error(
                        f"An order with status {current['status']} cannot be changed to {next_status}.",
                        409,
                    )
                    return True
                cursor = connection.execute(
                    "UPDATE orders SET status=? WHERE id=? AND status=?",
                    (next_status, order_id, current["status"]),
                )
                if cursor.rowcount != 1:
                    self._send_error("This order was updated by another administrator. Refresh and try again.", 409)
                    return True
                updated = connection.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
                order = self._order_json(connection, updated)
            self._send_json({"order": order})
            return True
        if path == "/api/profile":
            try:
                with connect_db() as connection:
                    user = self._require_user(connection)
                    username = str(data.get("username", "")).strip()[:32]
                    full_name = str(data.get("name", "")).strip()[:80]
                    email = str(data.get("email", "")).strip().lower()
                    phone = str(data.get("phone", "")).strip()[:40]
                    gender = str(data.get("gender", "")).strip()
                    if gender not in ("", "male", "female", "other"):
                        self._send_error("Choose a valid gender option.")
                        return True
                    dob = data.get("dateOfBirth") if isinstance(data.get("dateOfBirth"), dict) else {}
                    day, month, year = (str(dob.get(key, "")).strip() for key in ("day", "month", "year"))
                    if any((day, month, year)):
                        try:
                            month_number = datetime.strptime(month, "%B").month
                            date(int(year), month_number, int(day))
                        except (TypeError, ValueError):
                            self._send_error("Enter a valid date of birth.")
                            return True
                    avatar = str(data.get("avatarImage", ""))
                    if avatar and (len(avatar) > 1_400_000 or not re.fullmatch(r"data:image/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}", avatar)):
                        self._send_error("Profile images must be a JPEG or PNG no larger than 1 MB.")
                        return True
                    if not username or not full_name or not EMAIL_PATTERN.fullmatch(email):
                        self._send_error("Enter a username, name, and valid email address.")
                        return True
                    try:
                        connection.execute(
                            """UPDATE users SET username=?, full_name=?, email=?, phone=?, gender=?, birth_day=?, birth_month=?, birth_year=?, avatar_image=? WHERE id=?""",
                            (username, full_name, email, phone, gender, day, month, year, avatar, user["id"]),
                        )
                    except DATABASE_INTEGRITY_ERRORS:
                        self._send_error("That email address is already used by another account.", 409)
                        return True
                    updated = connection.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
                self._send_json({"account": self._account_json(updated)})
            except PermissionError as error:
                self._send_error(str(error), 401)
            return True
        if path == "/api/change-password":
            try:
                with connect_db() as connection:
                    user = self._require_user(connection)
                    current = str(data.get("currentPassword", ""))
                    new_password = str(data.get("newPassword", ""))
                    if not hmac.compare_digest(password_digest(current, user["password_salt"]), user["password_hash"]):
                        self._send_error("Current password is incorrect.", 400)
                        return True
                    if len(new_password) < 8 or len(new_password) > 128:
                        self._send_error("New password must be between 8 and 128 characters.")
                        return True
                    salt = secrets.token_bytes(16)
                    connection.execute(
                        "UPDATE users SET password_salt=?, password_hash=? WHERE id=?",
                        (salt, password_digest(new_password, salt), user["id"]),
                    )
                    connection.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
                    token = self._new_session(connection, user["id"])
                self._send_json({"ok": True}, extra_headers=[self._cookie_header(token)])
            except PermissionError as error:
                self._send_error(str(error), 401)
            return True
        return False

    def _handle_api_delete(self, path: str) -> bool:
        if not self._check_origin():
            self._send_error("Cross-site request rejected.", 403)
            return True
        with connect_db() as connection:
            try:
                user = self._require_user(connection)
            except PermissionError as error:
                self._send_error(str(error), 401)
                return True
            if path.startswith("/api/orders/"):
                order_id = unquote(path.removeprefix("/api/orders/"))
                cursor = connection.execute(
                    "DELETE FROM orders WHERE id=? AND user_id=? AND status='Processing'",
                    (order_id, user["id"]),
                )
                if cursor.rowcount == 0:
                    self._send_error("This order can no longer be cancelled.", 409)
                else:
                    self._send_json({"ok": True})
                return True
            if path.startswith("/api/addresses/"):
                address_id = path.removeprefix("/api/addresses/")
                cursor = connection.execute("DELETE FROM addresses WHERE id=? AND user_id=?", (address_id, user["id"]))
                if cursor.rowcount == 0:
                    self._send_error("Address not found.", 404)
                else:
                    self._send_json({"ok": True})
                return True
        return False

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path.startswith("/api/"):
            try:
                if self._handle_api_get(path):
                    return
                self._send_error("API route not found.", 404)
            except AdminRequiredError as error:
                self._send_error(str(error), 403)
            except PermissionError as error:
                self._send_error(str(error), 401)
            except Exception:
                self._send_error("The request could not be completed.", 500)
            return
        super().do_GET()

    def _handle_write(self, method: str) -> None:
        path = urlsplit(self.path).path
        if not path.startswith("/api/"):
            self._send_error("API route not found.", 404)
            return
        try:
            data = self._read_json() if method in ("POST", "PUT") else {}
            handled = (
                self._handle_api_post(path, data)
                if method == "POST"
                else self._handle_api_put(path, data)
                if method == "PUT"
                else self._handle_api_delete(path)
            )
            if not handled:
                self._send_error("API route not found.", 404)
        except ValueError as error:
            self._send_error(str(error))
        except AdminRequiredError as error:
            self._send_error(str(error), 403)
        except PermissionError as error:
            self._send_error(str(error), 401)
        except Exception:
            self._send_error("The request could not be completed.", 500)

    def do_POST(self) -> None:
        self._handle_write("POST")

    def do_PUT(self) -> None:
        self._handle_write("PUT")

    def do_DELETE(self) -> None:
        self._handle_write("DELETE")


class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True

    def __init__(self, server_address, request_handler, max_workers: int):
        self._request_slots = BoundedSemaphore(max_workers)
        super().__init__(server_address, request_handler)

    def process_request(self, request, client_address) -> None:
        if not self._request_slots.acquire(blocking=False):
            try:
                request.sendall(
                    b"HTTP/1.1 503 Service Unavailable\r\n"
                    b"Content-Length: 0\r\n"
                    b"Connection: close\r\n"
                    b"Retry-After: 2\r\n\r\n"
                )
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._request_slots.release()
            raise

    def process_request_thread(self, request, client_address) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Northgate storefront server.")
    parser.add_argument(
        "--promote-admin",
        metavar="EMAIL",
        help="promote an existing account to administrator, then exit",
    )
    arguments = parser.parse_args()
    initialize_database()
    if arguments.promote_admin:
        email = arguments.promote_admin.strip().lower()
        if not EMAIL_PATTERN.fullmatch(email) or len(email) > 254:
            parser.error("--promote-admin requires a valid account email address.")
        with connect_db() as connection:
            cursor = connection.execute("UPDATE users SET role='admin' WHERE email=? COLLATE NOCASE", (email,))
            if cursor.rowcount != 1:
                parser.error("No account with that email exists. Create the account first, then promote it.")
        print(f"Administrator access granted to {email}.")
        return
    display_host = "127.0.0.1" if HOST in ("0.0.0.0", "::") else HOST
    print(f"Starting Northgate server on {display_host}:{PORT}", flush=True)
    server = BoundedThreadingHTTPServer((HOST, PORT), NorthgateHandler, MAX_CONCURRENT_REQUESTS)
    print(f"Northgate local app running at http://{display_host}:{PORT}", flush=True)
    if HOST in ("0.0.0.0", "::"):
        print("Network access is enabled by NORTHGATE_HOST; use HTTPS for non-local production deployments.")
    print(f"Database: {'PostgreSQL' if DATABASE_URL else DATABASE}")
    print(f"Maximum concurrent requests: {MAX_CONCURRENT_REQUESTS}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Northgate local app.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()