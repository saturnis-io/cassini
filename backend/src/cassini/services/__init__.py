"""Service layer modules for Cassini.

Holds higher-level orchestration that composes repositories, engines, and
external clients. Routers should depend on services rather than poking
repositories directly when more than CRUD is involved.
"""
