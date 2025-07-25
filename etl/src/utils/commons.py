# --- IMPORTS ---

# Standard Library

import os
import logging
from typing import Optional

# Site Packages

# Local

from .db import DBHandler


def setup_logger(name: str):
    """
    General logger configurator

    :param name: logger name, generally the script or class name
    :return: the logger, with debug level in development (change into info in production)
    """
    logger = logging.getLogger(name)
    # noinspection SpellCheckingInspection
    logging.basicConfig(format="%(asctime)s - %(name)-7s - %(levelname)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    logger.setLevel(logging.DEBUG)
    return logger


def init_db(logger: Optional[logging.Logger] = None) -> DBHandler:
    """
    This code snippet establishes a connection to a PostgreSQL database. It initializes a dictionary secrets with
    database connection parameters (db_host, db_port, db_user, db_pass, db_name) sourced from environment variables.

    :param logger: the logger object (optional)
    :return: MegaPostgresHandler object
    """
    if logger:
        logger.info("Connecting to DB...")
    secrets = dict(db_host=os.getenv("DB_HOST"),
                   db_port=os.getenv("DB_PORT"),
                   db_user=os.getenv("POSTGRES_USER"),
                   db_pass=os.getenv("POSTGRES_PASSWORD"),
                   db_name=os.getenv("POSTGRES_DB"))
    dbh = DBHandler(
        **secrets,
    )

    if logger:
        logger.info(f"Successfully connected to {dbh.db_host}")

    return dbh