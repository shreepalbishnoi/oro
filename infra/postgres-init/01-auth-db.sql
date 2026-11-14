-- Runs once, on a fresh data volume. Better Auth (the web app's accounts) keeps its tables in
-- their own database so they never mix with the API schema managed by Alembic.
CREATE DATABASE oro_auth OWNER oro;
