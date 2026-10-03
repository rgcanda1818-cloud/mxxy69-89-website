# Deploying Northgate on Render

Northgate is prepared to run as a Render web service backed by Render PostgreSQL. The local launcher and SQLite database remain available for development; setting `DATABASE_URL` switches the server to PostgreSQL.

## First deployment

1. Put this project in a GitHub repository. Do not upload `.venv`, `__pycache__`, local database files, passwords, or environment-variable files.
2. In Render, create a Blueprint from that repository and select `render.yaml`.
3. Review the web-service and PostgreSQL plans and their costs before confirming. The Blueprint provisions paid resources.
4. Wait for the service's `/api/health` check to pass, then open the `onrender.com` URL shown in Render.
5. Create your own account on the hosted site. Promote it from the Render service shell with `python server.py --promote-admin you@example.com`.

The Blueprint keeps the web service and database in the same region, gives the database a private connection, and does not configure a public database address. Render terminates HTTPS; the app continues to bind to the port Render provides.

## Traffic and data notes

The server handles requests concurrently up to `NORTHGATE_MAX_CONCURRENT_REQUESTS` (64 by default). Beyond that limit, it returns `503 Service Unavailable` with `Retry-After` rather than creating unlimited worker threads. PostgreSQL allows the app to be scaled to multiple web instances without depending on per-instance files. Begin with one instance, load-test realistic traffic, then increase the web-service instance count in Render as needed. Autoscaling availability depends on your Render workspace plan.

This is still a demo storefront, not a production commerce system. Do not collect real customer details, reuse real passwords, or accept payments. The site has no payment provider, order email service, operational on-call monitoring, or verified load-test capacity. A health check confirms that the app can query its database; it does not guarantee uptime or a particular traffic capacity.

The local SQLite database is not automatically uploaded or copied to Render PostgreSQL. Only create hosted demo accounts after deployment. Back up the Render database using Render's supported backup features before making operational changes.
