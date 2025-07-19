import datetime
from utils import setup_logger, init_db
from jsonargparse import ArgumentParser

from etl.src.steps import lnd

logger = setup_logger('ETL')


def argparse():
    parser = ArgumentParser(prog="Mealplan-Pro ETL")
    parser.add_argument(
        "--steps",
        "-s",
        dest="steps",
        nargs="*",
        default=['lnd'],
        choices=['lnd'],
        help="Select witch steps to perform",
    )
    return parser


def create_default_id_run():
    return int(datetime.datetime.now().timestamp())


def main():
    cfg = argparse().parse_args()

    logger.info(f"Start with steps: {cfg.steps})")

    if 'lnd' in cfg.steps:
        cfg.id_run = lnd.execute.main()


if __name__ == "__main__":
    main()
