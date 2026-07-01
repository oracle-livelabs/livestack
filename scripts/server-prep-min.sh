
# server-prep-min.sh
#
# Prepares a minimal Oracle Linux 9 OCI server for running the LiveStack Demos.
# It updates the system, opens the ORDS and application ports,
# expands the boot volume, installs Podman/container tooling and OCI/Python
# dependencies, and enables the settings required for rootless containers.
#
# Run this script on the target server as a user with sudo privileges.

## update
sudo dnf update -y

## set firewall rules
sudo firewall-cmd --permanent --add-port=8181/tcp #ORDS
sudo firewall-cmd --permanent --add-port=8505/tcp #app
sudo firewall-cmd --reload

#expand boot volume (https://docs.oracle.com/en-us/iaas/oracle-linux/oci-utils/index.htm#oci-growfs)
sudo /usr/libexec/oci-growfs -y

#podman and utensils - https://docs.oracle.com/en/operating-systems/oracle-linux/podman/podman-InstallingPodmanandRelatedUtilities.html
sudo dnf install -y oracle-epel-release-el9
sudo dnf config-manager --enable ol9_developer_EPEL
sudo dnf install -y container-tools
sudo dnf install -y podman-compose
sudo dnf -y install oraclelinux-developer-release-el9
sudo dnf -y install python39-oci-cli python3.9-pip
sudo dnf install -y python3.11 python3.11-pip
sudo pip3.11 install oracledb dotenv
sudo pip3.11 install --upgrade podman-compose
sudo loginctl enable-linger 'opc'
sudo setsebool -P container_manage_cgroup on

