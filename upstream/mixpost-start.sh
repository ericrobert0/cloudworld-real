#!/bin/sh

: "${DB_HOST:=mysql}"
: "${DB_PORT:=3306}"
: "${DB_DATABASE}"
: "${DB_USERNAME}"
: "${DB_PASSWORD}"

handleLegacyMigrations() {
  # Update migration timestamps (In the case of a legacy project)
  # Sync the timestamps of the migration files with the timestamps in the migrations table
  php artisan mixpost:update-migration-timestamps

  export MYSQL_PWD="$DB_PASSWORD"

  MIGRATIONS_TABLE_EXISTS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" -D "$DB_DATABASE" -N -B -e \
  "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '$DB_DATABASE' AND table_name = 'migrations') AS table_exists;")

  if [ "$MIGRATIONS_TABLE_EXISTS" -eq 1 ]; then

    # Check if old Mixpost migrations exist
    LEGACY_MIGRATIONS_EXISTS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" -D "$DB_DATABASE" -N -B -e \
    "SELECT EXISTS (SELECT 1 FROM migrations WHERE migration LIKE '%_create_mixpost_accounts_table') AS exists_flag;")

    if [ "$LEGACY_MIGRATIONS_EXISTS" -eq 1 ]; then
        rm database/migrations/*_create_mixpost_tables.php
    fi

  fi

  unset MYSQL_PWD
}

 # Copy commands
cp -r /var/www/app/commands/* app/Console/Commands

 # Copy migration files for updates
cp -r /var/www/app/migrations database

# Permissions
chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache

# Create .env file
/var/www/startup/create_env.sh

# Laravel stuff
php artisan optimize

# Wait for MySQL
/usr/local/bin/wait-for-it.sh $DB_HOST:$DB_PORT -t 30

handleLegacyMigrations

# Migrate database tables
php artisan migrate --force

# Clear Mixpost cache
php artisan mixpost:clear-settings-cache
php artisan mixpost:clear-services-cache

# Check if the email exists
export MYSQL_PWD="$DB_PASSWORD"

DEFAULT_ADMIN_USER_EXISTS=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" -D "$DB_DATABASE" -N -B -e \
"SELECT EXISTS (SELECT 1 FROM users ) AS email_exists;")

if [ "$DEFAULT_ADMIN_USER_EXISTS" -eq 0 ]; then
    php artisan mixpost-auth:create --admin
fi

unset MYSQL_PWD

# Start cron
service cron start

# Start supervisor
/usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf &

  echo "
      __  ___ _                            __ 
    /  |/  /(_)_  __ ____   ____   _____ / /_
    / /|_/ // /| |/_// __ \ / __ \ / ___// __/
  / /  / // /_>  < / /_/ // /_/ /(__  )/ /_  
  /_/  /_//_//_/|_|/ .___/ \____//____/ \__/  
                  /_/                         
  ";

  echo "------- Mixpost has started! -------"

tail -f /dev/null
