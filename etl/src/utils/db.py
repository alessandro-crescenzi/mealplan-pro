# --- IMPORTS ---

# Standard Library

import os
import logging
from typing import Optional, Union, List

# Site Packages

import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.engine.base import Engine


# Local


class DBHandler:
    def __init__(self,
                 db_host: str,
                 db_port: str,
                 db_user: str,
                 db_pass: str,
                 db_name: str,
                 ):
        self.db_host = db_host
        self.db_port = None if db_port is None else str(db_port)
        self.db_user = db_user
        self.db_pass = db_pass
        self.db_name = db_name
        self.engine = self.create_engine()

    @property
    def drivername(self) -> str:
        return "postgresql"

    @property
    def db_url(self) -> str:
        db_url = f"{self.drivername}://{self.db_user}:{self.db_pass}@{self.db_host}:{self.db_port}/{self.db_name}"
        return db_url

    def create_engine(self) -> Engine:
        engine = create_engine(self.db_url)
        return engine

    def execute_query(self,
                      query: str,
                      return_df: bool = False) -> Union[None, pd.DataFrame]:
        with self.engine.begin() as con:
            if return_df:
                return pd.read_sql(query, con=con)
            else:
                con.execute(query)
                return None
