-- Local fallback bootstrap: one database per persisted service.
-- ("betting" is created by POSTGRES_DB; pricing needs creating here.)
CREATE DATABASE pricing OWNER arena;
