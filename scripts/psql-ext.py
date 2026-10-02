#!/usr/bin/env python3
"""Run a SQL file against the external database (handles special chars in the password).
Usage: python3 scripts/psql-ext.py db/000X_name.sql"""
import os, re, subprocess, sys

s = os.environ["EXT_DB_CONNECTION_STRING"]
u, p, h, port, db = re.match(r"postgres(?:ql)?://([^:]+):(.*)@([^@/:]+):(\d+)/([^?]+)", s).groups()
env = dict(os.environ, PGPASSWORD=p)
args = ["psql", "-h", h, "-p", port, "-U", u, "-d", db, "-v", "ON_ERROR_STOP=1"]
for f in sys.argv[1:]:
    args += ["-f", os.path.abspath(f)]
args += ["-c", "notify pgrst, 'reload schema';"]
sys.exit(subprocess.run(args, env=env).returncode)
